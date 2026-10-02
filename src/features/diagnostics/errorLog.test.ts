// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_ERRORS, clearJsErrors, describeError, formatErrorLog, readJsErrors, recordError } from './errorLog';

describe('journal d’erreurs', () => {
  beforeEach(() => clearJsErrors());

  it('décrit toute valeur levée', () => {
    expect(describeError(new TypeError('x is undefined'))).toBe('TypeError: x is undefined');
    expect(describeError('texte')).toBe('texte');
    expect(describeError({ message: 'plugin', code: 'X' })).toBe('plugin');
    expect(describeError({ code: 42 })).toBe('{"code":42}');
  });

  it('garde les dernières erreurs, avec leur pile', () => {
    for (let i = 0; i < MAX_ERRORS + 3; i++) recordError('Interface', new Error(`e${i}`), i);
    const entries = readJsErrors();
    expect(entries).toHaveLength(MAX_ERRORS);
    expect(entries[0]).toMatchObject({ at: 3, source: 'js', where: 'Interface', message: 'Error: e3' });
    expect(entries[0]?.stack).toContain('e3');
    clearJsErrors();
    expect(readJsErrors()).toEqual([]);
  });

  it('texte à partager lisible', () => {
    const text = formatErrorLog(
      [{ at: Date.UTC(2026, 9, 2, 8), source: 'native', where: 'Automatisme', message: 'IOException: réseau', stack: 'at x' }],
      'version 0.2.0.31',
    );
    expect(text).toBe("Journal d'erreurs Prisme — version 0.2.0.31\n\n[2026-10-02T08:00:00.000Z] Natif · Automatisme\nIOException: réseau\nat x");
  });
});
