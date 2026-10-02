import { describe, expect, it } from 'vitest';
import { DEFAULT_MUSIC_PREFS, MUSIC_STATUS, buildMusicConfig, musicStatusKind } from './model';

describe('pochette de la musique', () => {
  it('par défaut : les deux écrans, retour au fond précédent activé', () => {
    expect(DEFAULT_MUSIC_PREFS).toEqual({ target: 'both', restore: true });
  });

  it('réglages envoyés au natif : option, écran visé et retour', () => {
    expect(buildMusicConfig(false, DEFAULT_MUSIC_PREFS)).toEqual({ enabled: false, target: 'both', restore: true });
    expect(buildMusicConfig(true, { target: 'lock', restore: false })).toEqual({ enabled: true, target: 'lock', restore: false });
  });

  it("statut : l'accès manquant passe avant tout, même option coupée", () => {
    expect(musicStatusKind({ accessGranted: false, showing: false }, true)).toBe('access');
    expect(musicStatusKind({ accessGranted: false, showing: false }, false)).toBe('access');
    expect(musicStatusKind({ accessGranted: true, showing: false }, false)).toBe('off');
    expect(musicStatusKind({ accessGranted: true, showing: false }, true)).toBe('ready');
    expect(musicStatusKind({ accessGranted: true, showing: true }, true)).toBe('showing');
  });

  it('chaque statut a son texte', () => {
    expect(MUSIC_STATUS.access.text).toBe("Autorise l'accès aux notifications");
    expect(MUSIC_STATUS.ready.text).toBe("Prêt : la pochette s'affiche dès qu'une musique joue");
    for (const { text } of Object.values(MUSIC_STATUS)) expect(text.length).toBeGreaterThan(0);
  });
});
