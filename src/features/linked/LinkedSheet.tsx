import { useCallback, useEffect, useMemo, useState } from 'react';
import { exportEdit, renderEdit } from '@/features/editor/render';
import { type EditableImage, loadEditableImage } from '@/features/editor/source';
import { saveCreation } from '@/features/library/creations';
import { applyWallpaper } from '@/features/preview/applyWallpaper';
import type { Wallpaper } from '@/features/sources/types';
import { screenRatio, useScreenInfo } from '@/shared/lib/screen';
import { type NormalizedRect, nativeErrorMessage } from '@/shared/native';
import { Button, Chip, SegmentedButtons, Spinner } from '@/shared/ui/components';
import { FittedCanvas } from '@/shared/ui/FittedCanvas';
import { BottomSheet, showSnackbar } from '@/shared/ui/overlays';
import { VARIANTS, type VariantKey, variantCrop } from './variants';
import './linked.css';

/** Accueil et verrouillage assortis : l'image d'un côté, une variante (floue, sombre…) de l'autre. */
export function LinkedSheet({
  wallpaper,
  crop,
  open,
  onClose,
}: {
  wallpaper: Wallpaper;
  crop?: NormalizedRect;
  open: boolean;
  onClose: () => void;
}) {
  const screen = useScreenInfo();
  const [image, setImage] = useState<EditableImage | null>(null);
  const [variantKey, setVariantKey] = useState<VariantKey>('blurDim');
  const [variantOn, setVariantOn] = useState<'lock' | 'home'>('lock');
  const [busy, setBusy] = useState(false);
  const variant = VARIANTS.find((v) => v.key === variantKey) ?? VARIANTS[0]!;
  const output = useMemo(() => (screen ? { width: screen.width, height: screen.height } : null), [screen]);

  useEffect(() => {
    if (!open || !output) return;
    let alive = true;
    loadEditableImage(wallpaper, crop, output).then(
      (img) => (alive ? setImage(img) : img.bitmap.close()),
      (e) => alive && showSnackbar(nativeErrorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [open, wallpaper, crop, output]);

  useEffect(() => () => image?.bitmap.close(), [image]);

  const drawOriginal = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (image && output) renderEdit(ctx, image.bitmap, image.size, variantCrop(VARIANTS[0]!, image.size, crop, output), { ...variant.params, blur: 0, dim: 0, grain: 0, grayscale: false }, w, h);
    },
    [image, crop, output, variant],
  );
  const drawVariant = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (image && output) renderEdit(ctx, image.bitmap, image.size, variantCrop(variant, image.size, crop, output), variant.params, w, h);
    },
    [image, crop, output, variant],
  );

  const apply = async () => {
    if (!image || !output) return;
    setBusy(true);
    try {
      const data = await exportEdit(image.bitmap, image.size, variantCrop(variant, image.size, crop, output), variant.params, output);
      const creation = await saveCreation(data, wallpaper.color, `${variant.label} · ${wallpaper.alt}`);
      const [home, lock] = variantOn === 'lock' ? [wallpaper, creation] : [creation, wallpaper];
      await applyWallpaper({ wallpaper: home, target: 'home', crop: home === wallpaper ? crop : undefined });
      await applyWallpaper({ wallpaper: lock, target: 'lock', crop: lock === wallpaper ? crop : undefined });
      showSnackbar('Fonds assortis appliqués sur l’accueil et le verrouillage');
      onClose();
    } catch (e) {
      showSnackbar(`Échec : ${nativeErrorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const ratio = screenRatio(screen);
  const homeDraw = variantOn === 'lock' ? drawOriginal : drawVariant;
  const lockDraw = variantOn === 'lock' ? drawVariant : drawOriginal;

  return (
    <BottomSheet open={open} onClose={onClose} title="Fonds assortis">
      <div className="linked">
        <div className="linked__previews">
          {image ? (
            <>
              <figure>
                <FittedCanvas className="linked__canvas" ratio={ratio} draw={homeDraw} label="Écran d'accueil" />
                <figcaption>Accueil</figcaption>
              </figure>
              <figure>
                <FittedCanvas className="linked__canvas" ratio={ratio} draw={lockDraw} label="Écran de verrouillage" />
                <figcaption>Verrouillage</figcaption>
              </figure>
            </>
          ) : (
            <div className="linked__loading">
              <Spinner />
            </div>
          )}
        </div>
        <SegmentedButtons
          label="Écran qui reçoit la variante"
          options={[
            { value: 'lock', label: 'Variante au verrouillage' },
            { value: 'home', label: 'Variante à l’accueil' },
          ]}
          value={variantOn}
          onChange={setVariantOn}
        />
        <div className="chip-wrap" aria-label="Variante">
          {VARIANTS.map((v) => (
            <Chip key={v.key} selected={v.key === variantKey} onClick={() => setVariantKey(v.key)}>
              {v.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="sheet__actions">
        <Button icon="link" disabled={!image || busy} onClick={() => void apply()}>
          Appliquer les deux
        </Button>
      </div>
    </BottomSheet>
  );
}
