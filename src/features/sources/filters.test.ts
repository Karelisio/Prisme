import { describe, expect, it } from 'vitest';
import { classifyColor, isHighResPortrait, matchesColor, matchesRatio, pexelsColor, unsplashColor } from './filters';

describe('filtres', () => {
  it('ne garde que les portraits haute résolution', () => {
    expect(isHighResPortrait({ width: 1080, height: 2400 })).toBe(true);
    expect(isHighResPortrait({ width: 800, height: 1200 })).toBe(false);
    expect(isHighResPortrait({ width: 4000, height: 3000 })).toBe(false);
    expect(isHighResPortrait({ width: 2000, height: 2100 })).toBe(false);
  });

  it('filtre par ratio', () => {
    const tall = { width: 1080, height: 2400 };
    const sixteenNine = { width: 1080, height: 1920 };
    const fourThree = { width: 3000, height: 4000 };
    expect(matchesRatio(tall, 'tall', 2.22)).toBe(true);
    expect(matchesRatio(sixteenNine, 'standard', 2.22)).toBe(true);
    expect(matchesRatio(fourThree, 'wide', 2.22)).toBe(true);
    expect(matchesRatio(fourThree, 'tall', 2.22)).toBe(false);
    expect(matchesRatio(tall, 'screen', 2.22)).toBe(true);
    expect(matchesRatio(sixteenNine, 'screen', 2.22)).toBe(false);
    expect(matchesRatio(fourThree, 'all', 2.22)).toBe(true);
  });

  it('traduit les couleurs pour chaque API', () => {
    expect(unsplashColor('pink')).toBe('magenta');
    expect(unsplashColor('gray')).toBeNull();
    expect(pexelsColor('teal')).toBe('turquoise');
    expect(pexelsColor('black_and_white')).toBeNull();
  });

  it('classe une couleur moyenne', () => {
    expect(classifyColor('#0a0a0a')).toContain('black');
    expect(classifyColor('#fafafa')).toContain('white');
    expect(classifyColor('#808080')).toContain('gray');
    expect(classifyColor('#d32f2f')).toEqual(['red']);
    expect(classifyColor('#1e88e5')).toEqual(['blue']);
    expect(classifyColor('#43a047')).toEqual(['green']);
    expect(classifyColor('#8e24aa')).toEqual(['purple']);
    expect(classifyColor('not a color')).toEqual([]);
    expect(matchesColor({ color: '#1e88e5' }, null)).toBe(true);
    expect(matchesColor({ color: '#1e88e5' }, 'red')).toBe(false);
  });
});
