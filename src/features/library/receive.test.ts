// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNavigation } from '@/app/navigation';
import { showSnackbar } from '@/shared/ui/overlays';
import { openReceived, scanAndOpen, showReceived } from './receive';
import { encodeCollection, toLink } from './share';

// Les bulles dépendent des composants (icônes SVG) : seul leur message compte ici.
vi.mock('@/shared/ui/overlays', () => ({ showSnackbar: vi.fn() }));

const top = () => useNavigation.getState().overlays.at(-1);
const message = () => vi.mocked(showSnackbar).mock.calls.at(-1)?.[0];

beforeEach(() => {
  useNavigation.setState({ overlays: [], tab: 'explore' });
  vi.mocked(showSnackbar).mockClear();
});

describe('ouverture d’une collection reçue', () => {
  it('empile l’aperçu une seule fois pour un même code', () => {
    showReceived('abc', { name: 'Nuit', ids: ['unsplash:1'] });
    showReceived('abc', { name: 'Nuit', ids: ['unsplash:1'] });
    expect(useNavigation.getState().overlays).toHaveLength(1);
    expect(top()).toMatchObject({ type: 'received', code: 'abc', name: 'Nuit', ids: ['unsplash:1'] });
    showReceived('autre', { name: 'Mer', ids: ['pexels:2'] });
    expect(useNavigation.getState().overlays).toHaveLength(2);
  });

  it('ouvre l’aperçu depuis un lien ou un message de partage', async () => {
    const code = await encodeCollection({ name: 'Plages', ids: ['unsplash:a', 'pexels:7'] });
    expect(await openReceived(toLink(code))).toBe(true);
    expect(top()).toMatchObject({ type: 'received', name: 'Plages', ids: ['unsplash:a', 'pexels:7'] });
    expect(message()).toBeUndefined();
  });

  it('explique ce qui ne va pas sans rien ouvrir', async () => {
    expect(await openReceived('bonjour')).toBe(false);
    expect(message()).toBe('Ce code n’est pas une collection Prisme');
    expect(top()).toBeUndefined();
  });

  it('scanner : lit un lien, ignore un scanner refermé, signale un QR étranger ou l’absence de Google Play', async () => {
    const code = await encodeCollection({ name: 'Scannée', ids: ['nasa:PIA1'] });
    // Premier appel : instancie le plugin web ; il n'y a rien à lire.
    await scanAndOpen();
    expect(top()).toBeUndefined();
    const web = window.__prismeLibraryWeb;
    expect(web).toBeDefined();
    if (!web) return;

    web.nextScan = toLink(code);
    await scanAndOpen();
    expect(top()).toMatchObject({ type: 'received', name: 'Scannée' });

    web.nextScan = 'https://example.com/pas-une-collection-prisme';
    await scanAndOpen();
    expect(message()).toBe('Ce code n’est pas une collection Prisme');

    web.scannerAvailable = false;
    await scanAndOpen();
    expect(message()).toBe('Le scanner de QR code demande les services Google Play, absents de ce téléphone. Utilise « Coller un code » à la place.');
  });
});
