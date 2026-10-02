import { fetchWallpaperById, splitId } from '@/features/sources/byId';
import { ApiError, type Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';

/** Où en est la récupération des fonds d'une collection reçue. */
export interface ReceivedResult {
  /** Fonds retrouvés. */
  found: Map<string, Wallpaper>;
  /** Fonds que leur source ne connaît plus. */
  missing: Set<string>;
  /** Fonds que la source n'a pas pu servir (réseau, clé, limite de requêtes) : on peut réessayer. */
  failed: Map<string, Error>;
}

export const emptyResult = (): ReceivedResult => ({ found: new Map(), missing: new Set(), failed: new Map() });

/** Copie indépendante : l'interface a besoin d'un nouvel objet à chaque étape pour se redessiner. */
const snapshot = (r: ReceivedResult): ReceivedResult => ({ found: new Map(r.found), missing: new Set(r.missing), failed: new Map(r.failed) });

/** Requêtes simultanées : assez pour aller vite, peu pour ménager les limites des API. */
const CONCURRENCY = 4;

/** Erreurs qui vaudraient pour tous les fonds de la même source : inutile d'insister. */
const blocking = (error: unknown): boolean => error instanceof ApiError && (error.kind === 'rate_limit' || error.kind === 'auth' || error.kind === 'missing_key');

export interface LoadOptions {
  thumbWidth: number;
  /** Résultat d'une tentative précédente : seuls les fonds restants (ou en échec) sont demandés. */
  previous?: ReceivedResult;
  signal?: AbortSignal;
  /** Appelé après chaque fond traité. */
  onProgress?: (result: ReceivedResult) => void;
  fetcher?: (id: string, thumbWidth: number) => Promise<Wallpaper | null>;
  concurrency?: number;
}

/**
 * Retrouve les fonds par leurs identifiants, quelques-uns à la fois. Une source qui refuse
 * (limite de requêtes, clé absente) n'est plus interrogée : ses fonds restent « en échec ».
 */
export async function loadReceived(ids: readonly string[], options: LoadOptions): Promise<ReceivedResult> {
  const { thumbWidth, signal, onProgress, fetcher = fetchWallpaperById, concurrency = CONCURRENCY } = options;
  const result: ReceivedResult = {
    found: new Map(options.previous?.found),
    missing: new Set(options.previous?.missing),
    failed: new Map(),
  };
  const queue = ids.filter((id) => !result.found.has(id) && !result.missing.has(id));
  const blocked = new Map<string, Error>();
  let next = 0;

  const worker = async () => {
    while (!signal?.aborted) {
      const id = queue[next++];
      if (id === undefined) return;
      const source = splitId(id)?.source ?? id;
      const stopped = blocked.get(source);
      if (stopped) {
        result.failed.set(id, stopped);
      } else {
        try {
          const wallpaper = await fetcher(id, thumbWidth);
          if (wallpaper) result.found.set(id, wallpaper);
          else result.missing.add(id);
        } catch (error) {
          const failure = error instanceof Error ? error : new Error(t('Fond non récupéré'));
          result.failed.set(id, failure);
          if (blocking(error)) blocked.set(source, failure);
        }
      }
      if (!signal?.aborted) onProgress?.(snapshot(result));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return result;
}

/** Fonds retrouvés, dans l'ordre du code. */
export const foundInOrder = (ids: readonly string[], result: ReceivedResult): Wallpaper[] =>
  ids.flatMap((id) => {
    const w = result.found.get(id);
    return w ? [w] : [];
  });

/** Messages (sans doublon) des sources qui n'ont pas répondu. */
export const failureMessages = (result: ReceivedResult): string[] => [...new Set([...result.failed.values()].map((e) => e.message))];
