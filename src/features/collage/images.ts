/** Chargement des photos du collage : décodées une seule fois, à la résolution utile, hors du fil de rendu. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { type EditableImage, loadEditableImage } from '@/features/editor/source';
import { useLibrary } from '@/features/library/store';
import type { Wallpaper } from '@/features/sources/types';
import { PrismeWallpaper, isNative, nativeErrorMessage } from '@/shared/native';
import { dominantFromPixels } from './colors';

export interface LoadedPhoto extends EditableImage {
  /** Largeur demandée au décodage (l'image d'origine peut être plus petite). */
  requested: number;
  /** Couleur dominante, pour proposer un fond assorti. */
  dominant: string | null;
}

export interface PhotoRequest {
  wallpaper: Wallpaper;
  /** Largeur de décodage voulue (voir `decodeWidth`). */
  width: number;
}

const WHOLE_IMAGE = { x: 0, y: 0, width: 1, height: 1 };
const UNKNOWN_SIDE = 4096;
const SAMPLE_SIDE = 48;

/** Taille d'origine inconnue (certaines images NASA) : l'image elle-même la fixera. */
const withSize = (w: Wallpaper): Wallpaper => (w.width > 0 && w.height > 0 ? w : { ...w, width: UNKNOWN_SIDE, height: UNKNOWN_SIDE });

/**
 * L'éditeur ne redimensionne à la volée que les images Unsplash et Pexels (le serveur renvoie la
 * taille demandée) et lit les autres telles quelles. Sur Android, une image distante d'une autre
 * source passe d'abord par une copie locale : même origine que l'app (pas de CORS) et canevas exportable.
 */
async function networkSource(w: Wallpaper): Promise<Wallpaper> {
  const sized = withSize(w);
  const resizable = w.source === 'unsplash' || w.source === 'pexels';
  if (resizable || !isNative || !/^https?:/.test(w.full)) return sized;
  const { path } = await PrismeWallpaper.cacheImage({ url: w.full });
  return { ...sized, source: 'device', full: path };
}

function dominantOf(bitmap: ImageBitmap): string | null {
  try {
    const scale = SAMPLE_SIDE / Math.max(bitmap.width, bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const color = dominantFromPixels(ctx.getImageData(0, 0, width, height).data);
    canvas.width = canvas.height = 0;
    return color;
  } catch {
    return null;
  }
}

async function loadPhoto(wallpaper: Wallpaper, width: number): Promise<LoadedPhoto> {
  const output = { width, height: width };
  let image: EditableImage;
  try {
    image = await loadEditableImage(await networkSource(wallpaper), WHOLE_IMAGE, output);
  } catch (error) {
    // Hors ligne ou source en panne : la copie hors ligne du favori, s'il y en a une (elle est plus lourde à décoder, d'où ce second choix).
    const offline = useLibrary.getState().offline[wallpaper.id]?.fullPath;
    if (!offline) throw error;
    image = await loadEditableImage({ ...withSize(wallpaper), source: 'device', full: offline }, WHOLE_IMAGE, output);
  }
  return { ...image, requested: width, dominant: dominantOf(image.bitmap) };
}

/** Une photo est à (re)charger si elle manque, a été libérée ou est trop petite pour les cases actuelles. */
const needsLoad = (photo: LoadedPhoto | undefined, width: number) =>
  !photo || photo.bitmap.width === 0 || photo.requested < width * 0.9;

/**
 * Charge une à une les photos demandées (un décodage à la fois : mémoire ménagée) et libère celles
 * qui ne sont plus utilisées. `keep` : identifiants des photos encore dans une case.
 */
export function useCollagePhotos(requests: readonly PhotoRequest[], keep: ReadonlySet<string>) {
  const [photos, setPhotos] = useState<Readonly<Record<string, LoadedPhoto>>>({});
  const [failed, setFailed] = useState<Readonly<Record<string, string>>>({});
  const latest = useRef(photos);
  latest.current = photos;
  // Les bitmaps remplacés ne sont fermés qu'après le rendu suivant, pour qu'aucun dessin en attente ne les utilise.
  const retired = useRef<ImageBitmap[]>([]);

  const next = requests.find((r) => !failed[r.wallpaper.id] && needsLoad(photos[r.wallpaper.id], r.width));
  const nextKey = next ? `${next.wallpaper.id}@${next.width}` : '';

  useEffect(() => {
    if (!next) return;
    let alive = true;
    const { wallpaper, width } = next;
    loadPhoto(wallpaper, width).then(
      (loaded) => {
        if (!alive) {
          loaded.bitmap.close();
          return;
        }
        const old = latest.current[wallpaper.id];
        if (old) retired.current.push(old.bitmap);
        setPhotos((prev) => ({ ...prev, [wallpaper.id]: loaded }));
      },
      (error: unknown) => {
        if (alive) setFailed((prev) => ({ ...prev, [wallpaper.id]: nativeErrorMessage(error) }));
      },
    );
    return () => {
      alive = false;
    };
    // `next` découle de `nextKey` : le rechargement ne dépend que de ce qui reste à charger.
  }, [nextKey]);

  useEffect(() => {
    for (const bitmap of retired.current.splice(0)) bitmap.close();
  });

  const keepKey = [...keep].sort().join('|');
  useEffect(() => {
    const drop = Object.keys(latest.current).filter((id) => !keep.has(id));
    if (drop.length > 0) {
      for (const id of drop) {
        const photo = latest.current[id];
        if (photo) retired.current.push(photo.bitmap);
      }
      setPhotos((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => keep.has(id))));
    }
    setFailed((prev) => {
      const kept = Object.entries(prev).filter(([id]) => keep.has(id));
      return kept.length === Object.keys(prev).length ? prev : Object.fromEntries(kept);
    });
  }, [keepKey]);

  useEffect(
    () => () => {
      for (const photo of Object.values(latest.current)) photo.bitmap.close();
      for (const bitmap of retired.current.splice(0)) bitmap.close();
    },
    [],
  );

  /** Réessaie une photo en échec (choisie à nouveau). */
  const retry = useCallback((id: string) => {
    setFailed((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  return { photos, failed, retry };
}
