import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';
import { ApiError } from '@/features/sources/types';

const NO_RETRY: ReadonlySet<string> = new Set(['missing_key', 'auth', 'rate_limit']);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 60_000,
      gcTime: 24 * 60 * 60_000,
      refetchOnWindowFocus: false,
      // Hors ligne : on tente quand même, puis on garde les données en cache.
      networkMode: 'offlineFirst',
      retry: (count, error) => !(error instanceof ApiError && NO_RETRY.has(error.kind)) && count < 2,
    },
  },
});

/** Cache des requêtes persisté dans IndexedDB : les flux déjà vus restent consultables hors ligne. */
export const queryPersister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => (await get<string>(key)) ?? null,
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'prisme-query-cache',
  throttleTime: 2_000,
});

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60_000;
