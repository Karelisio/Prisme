// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Wallpaper } from '@/features/sources/types';
import type { ReliefProgress } from '@/shared/native/automation';

const listeners: ((e: ReliefProgress) => void)[] = [];
const remove = vi.fn();
const prepareNative = vi.fn();

const wp = (id: string): Wallpaper => ({
  id,
  source: 'unsplash',
  width: 3000,
  height: 6000,
  color: '#204080',
  alt: id,
  thumb: `https://x/${id}/thumb`,
  preview: `https://x/${id}/preview`,
  full: `https://x/${id}/full`,
});

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  listeners.length = 0;
  remove.mockReset();
  prepareNative.mockReset();
  vi.doMock('@/features/library/useImageSrc', () => ({ applyUri: (w: Wallpaper) => w.full }));
  vi.doMock('@/shared/native/automation', () => ({
    PrismeLive: {
      addListener: async (_event: string, listener: (e: ReliefProgress) => void) => {
        listeners.push(listener);
        return { remove };
      },
      prepareRelief: prepareNative,
    },
  }));
});

describe('relief 3D', () => {
  it('étapes affichées, progression du module en pourcentage', async () => {
    const { reliefStageLabel } = await import('./relief');
    expect(reliefStageLabel({ stage: 'image' })).toBe('Préparation de la photo…');
    expect(reliefStageLabel({ stage: 'module' })).toBe('Téléchargement du module de détourage…');
    expect(reliefStageLabel({ stage: 'module', progress: 0.424 })).toBe('Téléchargement du module de détourage… 42 %');
    expect(reliefStageLabel({ stage: 'module', progress: 1 })).toBe('Téléchargement du module de détourage…');
    expect(reliefStageLabel({ stage: 'segment' })).toBe('Détourage du sujet…');
    expect(reliefStageLabel({ stage: 'compose' })).toBe('Comblement de l’arrière-plan…');
  });

  it('prêt seulement pour la photo préparée', async () => {
    const { reliefReady } = await import('./relief');
    expect(reliefReady(undefined, wp('a'), 'a')).toBe(false);
    expect(reliefReady({ ready: false }, wp('a'), 'a')).toBe(false);
    expect(reliefReady({ ready: true }, null, 'a')).toBe(false);
    expect(reliefReady({ ready: true }, wp('b'), 'a')).toBe(false);
    expect(reliefReady({ ready: true }, wp('a'), 'a')).toBe(true);
  });

  it('préparation : étapes transmises, photo retenue après réussite seulement', async () => {
    const { prepareRelief, useRelief } = await import('./relief');
    const steps: ReliefProgress[] = [];
    prepareNative.mockImplementationOnce(async () => {
      listeners.forEach((l) => l({ stage: 'segment' }));
      throw Object.assign(new Error('Aucun sujet détecté'), { code: 'NO_SUBJECT' });
    });
    await expect(prepareRelief(wp('a'), (p) => steps.push(p))).rejects.toThrow('Aucun sujet détecté');
    expect(steps).toEqual([{ stage: 'segment' }]);
    expect(useRelief.getState().preparedId).toBeNull();
    expect(remove).toHaveBeenCalledTimes(1);

    prepareNative.mockResolvedValueOnce({ ready: true, source: 'https://x/a/full', preview: 'data:image/png;base64,AA' });
    const info = await prepareRelief(wp('a'), (p) => steps.push(p));
    expect(info.ready).toBe(true);
    expect(prepareNative).toHaveBeenLastCalledWith({ uri: 'https://x/a/full' });
    expect(useRelief.getState()).toMatchObject({ preparedId: 'a', wallpaper: { id: 'a' } });
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
