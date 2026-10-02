import { useMemo } from 'react';
import { type AutoCollection, buildAutoCollections, isAutoId } from './auto';
import { useLibrary } from './store';

/** Collections automatiques, recalculées quand la bibliothèque change. */
export function useAutoCollections(): AutoCollection[] {
  const items = useLibrary((s) => s.items);
  const favorites = useLibrary((s) => s.favorites);
  const collections = useLibrary((s) => s.collections);
  const history = useLibrary((s) => s.history);
  return useMemo(() => buildAutoCollections({ items, favorites, collections, history }), [items, favorites, collections, history]);
}

/** Une collection automatique par son identifiant (undefined pour une collection de l'utilisateur ou si elle est vide). */
export function useAutoCollection(id: string): AutoCollection | undefined {
  const items = useLibrary((s) => s.items);
  const favorites = useLibrary((s) => s.favorites);
  const collections = useLibrary((s) => s.collections);
  const history = useLibrary((s) => s.history);
  return useMemo(
    () => (isAutoId(id) ? buildAutoCollections({ items, favorites, collections, history }).find((c) => c.id === id) : undefined),
    [id, items, favorites, collections, history],
  );
}
