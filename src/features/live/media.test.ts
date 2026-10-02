import { describe, expect, it } from 'vitest';
import { MEDIA_LIMIT_MB, formatDuration, formatSize, mediaDetails } from './media';

describe('durée d’une vidéo', () => {
  it('minutes et secondes, heures seulement si besoin', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(15_000)).toBe('0:15');
    expect(formatDuration(65_400)).toBe('1:05');
    expect(formatDuration(725_000)).toBe('12:05');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });

  it('arrondie à la seconde, jamais négative', () => {
    expect(formatDuration(1_499)).toBe('0:01');
    expect(formatDuration(1_500)).toBe('0:02');
    expect(formatDuration(-5_000)).toBe('0:00');
  });
});

describe('poids d’un fichier', () => {
  it('octets, Ko, Mo et Go, à la française', () => {
    expect(formatSize(0)).toBe('0 o');
    expect(formatSize(512)).toBe('512 o');
    expect(formatSize(820 * 1024)).toBe('820 Ko');
    expect(formatSize(48_600_000)).toBe('46,3 Mo');
    expect(formatSize(3 * 1024 * 1024)).toBe('3 Mo');
    expect(formatSize(300 * 1024 * 1024)).toBe('300 Mo');
    expect(formatSize(1.2 * 1024 ** 3)).toBe('1,2 Go');
  });
});

describe('description du fichier choisi', () => {
  it('une vidéo : durée, poids et taille', () => {
    expect(mediaDetails({ name: 'Vacances.mp4', sizeBytes: 48_600_000, durationMs: 15_000, width: 1080, height: 1920 })).toBe(
      '0:15 · 46,3 Mo · 1080 × 1920',
    );
  });

  it('un GIF : pas de durée', () => {
    expect(mediaDetails({ name: 'Chat.gif', sizeBytes: 3_200_000, width: 480, height: 480 })).toBe('3,1 Mo · 480 × 480');
  });

  it('taille inconnue : elle n’est pas affichée', () => {
    expect(mediaDetails({ name: 'x.gif', sizeBytes: 1024, width: 0, height: 0 })).toBe('1 Ko');
  });
});

describe('limites de poids', () => {
  it('les mêmes que celles du natif', () => {
    expect(MEDIA_LIMIT_MB).toEqual({ video: 300, gif: 50 });
  });
});
