import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '@/shared/i18n';
import { formatBytes } from './format';

afterEach(() => setLanguage('fr'));

describe('formatBytes', () => {
  it('affiche les octets, Ko et Mo à la française', () => {
    expect(formatBytes(512)).toBe('512 o');
    expect(formatBytes(1536)).toBe('1,5 Ko');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 Mo');
  });

  it('affiche B, KB, MB et GB à l’anglaise', () => {
    setLanguage('en');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(3.25 * 1024 ** 3)).toBe('3.3 GB');
  });
});
