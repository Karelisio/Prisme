import { type PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { NormalizedRect } from '@/shared/native';
import {
  type Point,
  type Size,
  type Transform,
  clampTransform,
  coverScale,
  cropFromTransform,
  distance,
  initialTransform,
  isDefaultTransform,
  midpoint,
  transformFromCrop,
  zoomAt,
} from './cropMath';

const TAP_MAX_MS = 250;
const TAP_MAX_MOVE = 8;
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_ZOOM = 2.5;
/** Dépassement du bord (en px) au-delà duquel un glissé horizontal passe au fond voisin. */
const SWIPE_MIN = 72;
/** Effet élastique : la scène ne suit qu'une partie du dépassement. */
const RUBBER = 0.35;

interface Gesture {
  start: Transform;
  startPoint: Point;
  startDistance: number;
  startMid: Point;
  startTime: number;
  moved: boolean;
}

interface PanZoomOptions {
  /** Glissé horizontal au-delà du bord de l'image : 1 = suivant, -1 = précédent ; true si accepté. */
  onSwipe?: (direction: 1 | -1) => boolean;
}

/**
 * Déplacement à un doigt, pincement, double appui pour zoomer. La transformation est appliquée
 * directement au style de l'élément (sans rendu React) pour rester fluide sur milieu de gamme.
 * Avec `onSwipe`, tirer l'image au-delà de son bord passe au fond voisin.
 */
export function usePanZoom(stage: Size | null, image: Size | null, onTap: () => void, options: PanZoomOptions = {}) {
  const targetRef = useRef<HTMLImageElement | null>(null);
  const swipeRef = useRef(options.onSwipe);
  swipeRef.current = options.onSwipe;
  const stageEl = useRef<HTMLElement | null>(null);
  const overscroll = useRef(0);
  const transform = useRef<Transform | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef(0);
  const tapTimer = useRef<number | undefined>(undefined);
  const [modified, setModified] = useState(false);

  const render = useCallback(() => {
    const el = targetRef.current;
    const t = transform.current;
    if (!el || !t || !stage || !image) return;
    const base = coverScale(stage, image);
    el.style.width = `${image.width * base}px`;
    el.style.height = `${image.height * base}px`;
    el.style.transform = `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scale / base})`;
  }, [stage, image]);

  const commit = useCallback(
    (t: Transform) => {
      if (!stage || !image) return;
      transform.current = clampTransform(t, stage, image);
      render();
      setModified(!isDefaultTransform(transform.current, stage, image));
    },
    [stage, image, render],
  );

  // Nouvelle scène ou nouvelle image : on repart du cadrage centré.
  useEffect(() => {
    if (!stage || !image) return;
    transform.current = initialTransform(stage, image);
    render();
    setModified(false);
  }, [stage, image, render]);

  useEffect(() => () => window.clearTimeout(tapTimer.current), []);

  const shiftStage = (dx: number, animate: boolean) => {
    const el = stageEl.current;
    if (!el) return;
    el.style.transition = animate ? 'translate 200ms cubic-bezier(0.2, 0, 0, 1)' : 'none';
    el.style.translate = dx ? `${dx}px 0` : '';
  };

  const local = (e: PointerEvent): Point => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startGesture = (time: number) => {
    const points = [...pointers.current.values()];
    const [a, b] = points;
    if (!a || !transform.current) return;
    gesture.current = {
      start: transform.current,
      startPoint: a,
      startDistance: b ? distance(a, b) : 0,
      startMid: b ? midpoint(a, b) : a,
      startTime: time,
      moved: gesture.current?.moved ?? false,
    };
  };

  const onPointerDown = (e: PointerEvent) => {
    stageEl.current = e.currentTarget as HTMLElement;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) gesture.current = null;
    startGesture(e.timeStamp);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current || !stage || !image) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    const [a, b] = [...pointers.current.values()];
    if (!a) return;
    if (b && g.startDistance > 0) {
      if (overscroll.current) {
        overscroll.current = 0;
        shiftStage(0, true);
      }
      const mid = midpoint(a, b);
      const zoomed = zoomAt(g.start, distance(a, b) / g.startDistance, g.startMid, stage, image);
      commit({ ...zoomed, x: zoomed.x + mid.x - g.startMid.x, y: zoomed.y + mid.y - g.startMid.y });
      g.moved = true;
    } else {
      const dx = a.x - g.startPoint.x;
      const dy = a.y - g.startPoint.y;
      if (Math.hypot(dx, dy) > TAP_MAX_MOVE) g.moved = true;
      if (!g.moved) return;
      const wanted = { ...g.start, x: g.start.x + dx, y: g.start.y + dy };
      commit(wanted);
      if (swipeRef.current && transform.current) {
        // Geste surtout horizontal : la scène accompagne le dépassement du bord.
        overscroll.current = Math.abs(dx) > Math.abs(dy) ? wanted.x - transform.current.x : 0;
        shiftStage(overscroll.current * RUBBER, false);
      }
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    const point = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      // On passe de deux doigts à un : le déplacement repart de la position actuelle.
      startGesture(e.timeStamp);
      return;
    }
    gesture.current = null;
    if (overscroll.current) {
      const over = overscroll.current;
      overscroll.current = 0;
      const swiped = Math.abs(over) >= SWIPE_MIN && (swipeRef.current?.(over < 0 ? 1 : -1) ?? false);
      if (!swiped) shiftStage(0, true);
    }
    if (!g || g.moved || e.timeStamp - g.startTime > TAP_MAX_MS || !point || !stage || !image || !transform.current) return;

    if (e.timeStamp - lastTap.current < DOUBLE_TAP_MS) {
      window.clearTimeout(tapTimer.current);
      lastTap.current = 0;
      const zoomed = !isDefaultTransform(transform.current, stage, image);
      commit(zoomed ? initialTransform(stage, image) : zoomAt(transform.current, DOUBLE_TAP_ZOOM, point, stage, image));
      return;
    }
    lastTap.current = e.timeStamp;
    tapTimer.current = window.setTimeout(onTap, DOUBLE_TAP_MS);
  };

  const reset = useCallback(() => {
    if (stage && image) commit(initialTransform(stage, image));
  }, [stage, image, commit]);

  /** Recadrage normalisé, ou undefined si l'image est simplement centrée. */
  const getCrop = useCallback((): NormalizedRect | undefined => {
    const t = transform.current;
    if (!t || !stage || !image || isDefaultTransform(t, stage, image)) return undefined;
    return cropFromTransform(t, stage, image);
  }, [stage, image]);

  const setCrop = useCallback(
    (crop: NormalizedRect) => {
      if (stage && image) commit(transformFromCrop(crop, stage, image));
    },
    [stage, image, commit],
  );

  return {
    targetRef,
    modified,
    reset,
    getCrop,
    setCrop,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
