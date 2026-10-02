import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Wallpaper } from '@/features/sources/types';
import { emptyResult, failureMessages, foundInOrder, loadReceived } from './received';

const wp = (id: string): Wallpaper => ({
  id,
  source: 'unsplash',
  width: 1080,
  height: 2400,
  color: '#204080',
  alt: id,
  thumb: `https://x/${id}/thumb`,
  preview: `https://x/${id}/preview`,
  full: `https://x/${id}/full`,
});

const delay = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms));

describe('récupération d’une collection reçue', () => {
  it('retrouve chaque fond, garde l’ordre du code et distingue les introuvables', async () => {
    const fetcher = vi.fn(async (id: string) => {
      await delay(id.endsWith('2') ? 5 : 1);
      return id === 'pexels:gone' ? null : wp(id);
    });
    const ids = ['unsplash:1', 'unsplash:2', 'pexels:gone', 'nasa:3'];
    const progress: number[] = [];
    const result = await loadReceived(ids, { thumbWidth: 360, fetcher, onProgress: (r) => progress.push(r.found.size + r.missing.size) });

    expect(foundInOrder(ids, result).map((w) => w.id)).toEqual(['unsplash:1', 'unsplash:2', 'nasa:3']);
    expect([...result.missing]).toEqual(['pexels:gone']);
    expect(result.failed.size).toBe(0);
    expect(fetcher).toHaveBeenCalledWith('unsplash:1', 360);
    expect(progress).toEqual([1, 2, 3, 4]);
  });

  it('limite le nombre de requêtes simultanées', async () => {
    let running = 0;
    let peak = 0;
    const fetcher = async (id: string) => {
      peak = Math.max(peak, ++running);
      await delay(2);
      running--;
      return wp(id);
    };
    const ids = Array.from({ length: 12 }, (_, i) => `pexels:${i}`);
    const result = await loadReceived(ids, { thumbWidth: 360, fetcher });
    expect(result.found.size).toBe(12);
    expect(peak).toBe(4);
    expect((await loadReceived(ids, { thumbWidth: 360, fetcher, concurrency: 1, previous: emptyResult() })).found.size).toBe(12);
  });

  it('n’insiste pas auprès d’une source qui refuse, mais continue avec les autres', async () => {
    const limited = new ApiError('unsplash', 'rate_limit', 'Limite de requêtes Unsplash atteinte, réessaie dans une heure');
    const fetcher = vi.fn(async (id: string) => {
      if (id.startsWith('unsplash:')) throw limited;
      return wp(id);
    });
    const ids = ['unsplash:1', 'pexels:1', 'unsplash:2', 'unsplash:3', 'pexels:2'];
    const result = await loadReceived(ids, { thumbWidth: 360, fetcher, concurrency: 1 });
    expect([...result.found.keys()]).toEqual(['pexels:1', 'pexels:2']);
    expect([...result.failed.keys()]).toEqual(['unsplash:1', 'unsplash:2', 'unsplash:3']);
    // Un seul appel à Unsplash : les suivants sont écartés sans requête.
    expect(fetcher.mock.calls.filter(([id]) => id.startsWith('unsplash:'))).toHaveLength(1);
    expect(failureMessages(result)).toEqual(['Limite de requêtes Unsplash atteinte, réessaie dans une heure']);
  });

  it('une erreur ordinaire ne bloque que le fond concerné', async () => {
    const fetcher = async (id: string) => {
      if (id === 'art:2') throw new ApiError('art', 'server', 'Erreur du musée (500)');
      if (id === 'art:3') throw 'boum';
      return wp(id);
    };
    const result = await loadReceived(['art:1', 'art:2', 'art:3', 'art:4'], { thumbWidth: 360, fetcher, concurrency: 1 });
    expect([...result.found.keys()]).toEqual(['art:1', 'art:4']);
    expect(failureMessages(result)).toEqual(['Erreur du musée (500)', 'Fond non récupéré']);
  });

  it('réessaie seulement ce qui manque', async () => {
    const calls: string[] = [];
    let offline = true;
    const fetcher = async (id: string) => {
      calls.push(id);
      if (offline && id === 'pexels:2') throw new ApiError('pexels', 'network', 'Pexels injoignable');
      return id === 'nasa:gone' ? null : wp(id);
    };
    const ids = ['pexels:1', 'pexels:2', 'nasa:gone'];
    const first = await loadReceived(ids, { thumbWidth: 360, fetcher });
    expect(failureMessages(first)).toEqual(['Pexels injoignable']);
    offline = false;
    calls.length = 0;
    const second = await loadReceived(ids, { thumbWidth: 360, fetcher, previous: first });
    expect(calls).toEqual(['pexels:2']);
    expect(foundInOrder(ids, second).map((w) => w.id)).toEqual(['pexels:1', 'pexels:2']);
    expect([...second.missing]).toEqual(['nasa:gone']);
    expect(second.failed.size).toBe(0);
  });

  it('s’arrête quand on quitte l’écran', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (id: string) => {
      if (id === 'pexels:2') controller.abort();
      await delay();
      return wp(id);
    });
    const onProgress = vi.fn();
    const ids = Array.from({ length: 10 }, (_, i) => `pexels:${i + 1}`);
    const result = await loadReceived(ids, { thumbWidth: 360, fetcher, concurrency: 1, signal: controller.signal, onProgress });
    expect(fetcher.mock.calls.length).toBeLessThan(10);
    expect(result.found.size).toBeLessThan(10);
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});
