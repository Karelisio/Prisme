import { afterEach, describe, expect, it } from 'vitest';
import { detectLanguage, locale, resolveLanguage, setLanguage, t, tn } from '.';

afterEach(() => setLanguage('fr'));

describe('traductions', () => {
  it('langue du système : français en tête, sinon anglais', () => {
    expect(detectLanguage(['fr-FR', 'en-US'])).toBe('fr');
    expect(detectLanguage(['en-US', 'fr-FR'])).toBe('en');
    expect(detectLanguage(['de-DE'])).toBe('en');
    expect(resolveLanguage('fr', ['en-US'])).toBe('fr');
    expect(resolveLanguage('system', ['fr-CA'])).toBe('fr');
  });

  it('texte français par défaut, variables remplacées, traduction manquante : français', () => {
    expect(t('{count} fonds', { count: 3 })).toBe('3 fonds');
    expect(tn(1, '{count} fond', '{count} fonds', {})).toBe('1 fond');
    expect(tn(0, '{count} fond', '{count} fonds')).toBe('0 fond');
    setLanguage('en');
    expect(t('Texte sans traduction')).toBe('Texte sans traduction');
    expect(locale()).toBe('en-GB');
  });
});
