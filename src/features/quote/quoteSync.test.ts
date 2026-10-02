// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROVERBS } from './proverbs';

const configure = vi.fn();
const sent = () => configure.mock.calls.map(([config]) => config);

beforeEach(() => {
  // Le dernier réglage envoyé est un état de module : chaque test repart de modules neufs.
  vi.resetModules();
  localStorage.clear();
  configure.mockReset();
  vi.doMock('@/shared/native/quote', () => ({ PrismeQuote: { configure } }));
});

async function start() {
  const { useSettings } = await import('@/features/settings/store');
  const { useQuotePrefs } = await import('./store');
  const { startQuoteSync } = await import('./quoteSync');
  return { useSettings, useQuotePrefs, stop: startQuoteSync() };
}

describe('synchronisation avec le natif', () => {
  it('envoie les réglages au lancement, puis à chaque changement utile, sans doublon', async () => {
    const { useSettings, useQuotePrefs, stop } = await start();
    expect(sent()).toEqual([{ enabled: false, target: 'lock', font: 'serif', position: 'bottom', size: 'medium', color: 'auto', shift: 0, quotes: [] }]);

    useSettings.getState().setFeature('quote', true);
    expect(sent()).toHaveLength(2);
    expect(sent().at(-1)).toMatchObject({ enabled: true, target: 'lock', shift: 0 });
    expect(sent().at(-1).quotes).toEqual(PROVERBS.map((text) => ({ text })));

    // Un réglage sans rapport, ou une valeur inchangée, n'envoie rien.
    useSettings.getState().update({ dailyHour: 7 });
    useSettings.getState().setFeature('music', true);
    useQuotePrefs.getState().update({ font: 'serif' });
    expect(sent()).toHaveLength(2);

    useQuotePrefs.getState().update({ font: 'sans', position: 'top' });
    expect(sent().at(-1)).toMatchObject({ font: 'sans', position: 'top' });
    useQuotePrefs.getState().another();
    expect(sent().at(-1)).toMatchObject({ shift: 1 });
    expect(sent()).toHaveLength(4);

    useSettings.getState().setFeature('quote', false);
    expect(sent().at(-1)).toMatchObject({ enabled: false, font: 'sans', shift: 1, quotes: [] });
    stop();
  });

  it('n’envoie les citations perso que si la source les contient', async () => {
    const { useSettings, useQuotePrefs, stop } = await start();
    useSettings.getState().setFeature('quote', true);
    const before = sent().length;

    // Source « Proverbes » : une citation de plus ne change pas la liste active.
    useQuotePrefs.getState().addQuote('Carpe diem', 'Moi');
    expect(sent()).toHaveLength(before);

    useQuotePrefs.getState().update({ source: 'mine' });
    expect(sent().at(-1).quotes).toEqual([{ text: 'Carpe diem', author: 'Moi' }]);
    useQuotePrefs.getState().update({ source: 'both' });
    expect(sent().at(-1).quotes).toHaveLength(PROVERBS.length + 1);
    stop();
  });

  it('réessaie au changement suivant quand le natif a refusé le réglage', async () => {
    configure.mockRejectedValueOnce(new Error('plugin absent'));
    const { useQuotePrefs, stop } = await start();
    // Laisse le refus remonter avant le changement suivant.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Le même réglage repart : l'échec n'a pas été retenu comme envoyé.
    useQuotePrefs.getState().update({ size: 'medium', font: 'serif' });
    useQuotePrefs.getState().update({ size: 'small' });
    useQuotePrefs.getState().update({ size: 'medium' });
    expect(sent().length).toBeGreaterThanOrEqual(2);
    expect(sent()[1]).toEqual(sent()[0]);
    stop();
  });

  it('une fois arrêtée, la synchronisation ne suit plus les réglages', async () => {
    const { useSettings, stop } = await start();
    stop();
    useSettings.getState().setFeature('quote', true);
    expect(sent()).toHaveLength(1);
  });

  it('reprend les préférences gardées d’une session précédente', async () => {
    localStorage.setItem(
      'prisme-quote',
      JSON.stringify({ state: { target: 'both', source: 'mine', font: 'sans', position: 'center', size: 'large', color: 'white', shift: 5, custom: [{ id: 'q1', text: 'Une phrase' }] }, version: 1 }),
    );
    localStorage.setItem('prisme-settings', JSON.stringify({ state: { features: { quote: true } }, version: 1 }));
    const { stop } = await start();
    expect(sent()).toEqual([
      { enabled: true, target: 'both', font: 'sans', position: 'center', size: 'large', color: 'white', shift: 5, quotes: [{ text: 'Une phrase' }] },
    ]);
    stop();
  });
});

describe('citations perso', () => {
  it('ajoute, modifie, supprime et remet une citation', async () => {
    const { useQuotePrefs, stop } = await start();
    const store = useQuotePrefs.getState();
    expect(store.addQuote('   ')).toBeNull();
    const first = store.addQuote('  Premier  mot  ', ' Moi ') as string;
    const second = store.addQuote('Deuxième') as string;
    expect(useQuotePrefs.getState().custom).toEqual([
      { id: first, text: 'Premier mot', author: 'Moi' },
      { id: second, text: 'Deuxième' },
    ]);

    expect(useQuotePrefs.getState().editQuote(first, 'Premier mot modifié', '')).toBe(true);
    expect(useQuotePrefs.getState().editQuote(first, '   ')).toBe(false);
    expect(useQuotePrefs.getState().editQuote('inconnue', 'x')).toBe(false);
    expect(useQuotePrefs.getState().custom[0]).toEqual({ id: first, text: 'Premier mot modifié' });

    const removed = useQuotePrefs.getState().custom[0] as { id: string; text: string };
    useQuotePrefs.getState().removeQuote(first);
    expect(useQuotePrefs.getState().custom.map((q) => q.id)).toEqual([second]);
    useQuotePrefs.getState().restoreQuote(removed, 0);
    expect(useQuotePrefs.getState().custom.map((q) => q.id)).toEqual([first, second]);

    // Gardées sur le téléphone.
    expect(JSON.parse(localStorage.getItem('prisme-quote') ?? '{}').state.custom).toHaveLength(2);
    stop();
  });

  it('fusionne celles d’une sauvegarde sans doublon', async () => {
    const { useQuotePrefs, stop } = await start();
    useQuotePrefs.getState().addQuote('Déjà là', 'Moi');
    useQuotePrefs.getState().mergeCustom([
      { id: 'a', text: 'Déjà là', author: 'Moi' },
      { id: 'b', text: 'Nouvelle' },
    ]);
    expect(useQuotePrefs.getState().custom.map((q) => q.text)).toEqual(['Déjà là', 'Nouvelle']);
    useQuotePrefs.getState().mergeCustom([{ id: 'b', text: 'Nouvelle' }]);
    expect(useQuotePrefs.getState().custom).toHaveLength(2);
    stop();
  });
});
