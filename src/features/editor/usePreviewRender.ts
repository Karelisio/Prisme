import { useCallback, useEffect, useRef, useState } from 'react';
import { type EditParams, hasEffect, renderEdit, renderEditAsync } from './render';
import type { EditableImage } from './source';

/** Largeur (px) à laquelle l'aperçu calcule le filtre et l'effet : le résultat est ensuite agrandi. */
const PREVIEW_WORK_WIDTH = 360;
/** Pause (ms) sans geste avant de lancer le calcul complet de l'effet. */
const SETTLE_MS = 160;

type Draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/**
 * Rendu de l'aperçu de l'éditeur.
 * - Sans effet artistique : rendu immédiat, dans le canevas.
 * - Avec un effet : calcul fractionné en basse résolution, recopié d'un coup à la fin (l'image précédente
 *   reste affichée entre-temps) ; un nouveau rendu annule le précédent.
 * - Pendant un geste de cadrage (`markDraft`), l'effet est sauté pour que la photo suive le doigt ;
 *   il revient dès que le geste s'arrête.
 */
export function usePreviewRender(image: EditableImage | null, params: EditParams): { draw: Draw; rendering: boolean; markDraft: () => void } {
  const [rendering, setRendering] = useState(false);
  // Change à la fin d'un geste : redessine l'aperçu en qualité complète.
  const [settled, setSettled] = useState(0);
  const job = useRef<AbortController | null>(null);
  const draft = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const markDraft = useCallback(() => {
    draft.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      draft.current = false;
      setSettled((n) => n + 1);
    }, SETTLE_MS);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      job.current?.abort();
    },
    [],
  );

  const draw = useCallback<Draw>(
    (ctx, width, height) => {
      job.current?.abort();
      job.current = null;
      if (!image) return;
      if (!hasEffect(params) || draft.current) {
        setRendering(false);
        renderEdit(ctx, image.bitmap, image.size, undefined, params, width, height, { draft: true });
        return;
      }
      const controller = new AbortController();
      job.current = controller;
      setRendering(true);
      const finish = (done: boolean) => {
        if ((done || !controller.signal.aborted) && job.current === controller) setRendering(false);
      };
      renderEditAsync(ctx, image.bitmap, image.size, undefined, params, width, height, {
        signal: controller.signal,
        atomic: true,
        workWidth: PREVIEW_WORK_WIDTH,
      }).then(finish, () => finish(false));
    },
    // `settled` n'est pas lu ici : il change à la fin d'un geste pour relancer le rendu complet.
    [image, params, settled],
  );

  return { draw, rendering, markDraft };
}
