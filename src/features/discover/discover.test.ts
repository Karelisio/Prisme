import { describe, expect, it } from 'vitest';
import { pexelsPhoto, unsplashPhoto } from '@/features/sources/__fixtures__/photos';
import { mapPexels } from '@/features/sources/pexels';
import type { Wallpaper } from '@/features/sources/types';
import { mapUnsplash } from '@/features/sources/unsplash';
import { dayKey, pickOfTheDay } from './daily';
import { authorKey, isHidden, mentions } from './hidden';
import { keywordsOf, normalize, topWords, words } from './keywords';
import { buildProfile, forYouSpec } from './profile';
import { similarColorSpec, similarSubjectSpec } from './similar';

const photo = (id: string, alt: string, extra: Partial<Wallpaper> = {}): Wallpaper => ({
  ...mapUnsplash(unsplashPhoto(id, { alt_description: alt }), 360),
  ...extra,
});

describe('mots-clés', () => {
  it('garde les mots qui décrivent le sujet', () => {
    expect(normalize('Forêt Éternelle')).toBe('foret eternelle');
    expect(words('A woman standing on top of a snowy mountain next to a lake')).toEqual(['woman', 'snowy', 'mountain', 'lake']);
    expect(words('Un chat noir sur le canapé')).toEqual(['chat', 'canape']);
    expect(keywordsOf(photo('a', 'a black and white photo of a cat'))).toEqual(['cat']);
    expect(keywordsOf({ source: 'wallhaven', alt: 'Fond Wallhaven abc' })).toEqual([]);
  });

  it('classe les mots par fréquence', () => {
    expect(topWords([['mountain', 'lake'], ['mountain', 'forest'], ['forest', 'mountain']], 2)).toEqual(['mountain', 'forest']);
    expect(topWords([['a'], ['b']], 5, 2)).toEqual([]);
  });
});

describe('contenus masqués', () => {
  const hidden = { hiddenIds: {}, hiddenAuthors: {}, hiddenWords: [] as string[] };

  it('reconnaît un sujet, sans accents ni pluriel', () => {
    expect(mentions('Two cats on a sofa', 'cat')).toBe(true);
    expect(mentions('Château de nuit', 'chateau')).toBe(true);
    expect(mentions('Un château', 'chat')).toBe(false);
    expect(mentions('red sports car at night', 'sports car')).toBe(true);
    expect(mentions('anything', '  ')).toBe(false);
  });

  it('masque un fond, un auteur ou un sujet', () => {
    const w = photo('x', 'a red car');
    expect(isHidden(w, hidden)).toBe(false);
    expect(isHidden(w, { ...hidden, hiddenIds: { [w.id]: { id: w.id, thumb: '', alt: '', at: 0 } } })).toBe(true);
    const key = authorKey(w) as string;
    expect(key).toBe('unsplash:ada');
    expect(isHidden(w, { ...hidden, hiddenAuthors: { [key]: { key, name: 'Ada', source: 'unsplash', at: 0 } } })).toBe(true);
    expect(isHidden(w, { ...hidden, hiddenWords: ['Car'] })).toBe(true);
    expect(authorKey({ source: 'pack', author: undefined })).toBeNull();
  });
});

describe('Plus comme ça', () => {
  it('cherche le sujet sur les sources généralistes', () => {
    const spec = similarSubjectSpec(photo('m', 'snowy mountain under the stars'));
    expect(spec?.searchQuery).toBe('snowy mountain stars');
    expect(spec?.queries.map((q) => q.kind)).toEqual(['unsplash-search', 'pexels-search', 'wallhaven', 'pixabay']);
  });

  it('utilise les étiquettes proches de Wallhaven', () => {
    const w = { ...photo('w', ''), id: 'wallhaven:94x38z', source: 'wallhaven' as const };
    expect(similarSubjectSpec(w)?.queries).toEqual([{ kind: 'wallhaven', query: 'like:94x38z', sorting: 'relevance' }]);
  });

  it('rapproche par la couleur quand elle est connue', () => {
    const spec = similarColorSpec(photo('c', 'sea', { color: '#1E88E5' }));
    expect(spec?.queries[0]).toEqual({ kind: 'unsplash-search', query: 'wallpaper', color: '#1e88e5' });
    expect(similarColorSpec(photo('u', 'sea', { color: '#808080' }))).toBeNull();
  });
});

describe('Pour toi', () => {
  it('déduit sujets, teinte et photographes des favoris', () => {
    const favorites = [
      photo('1', 'mountain lake at dawn', { color: '#1e88e5' }),
      photo('2', 'mountain forest', { color: '#1565c0' }),
      photo('3', 'forest path in autumn', { color: '#0d47a1' }),
      mapPexels(pexelsPhoto(4, { alt: 'mountain river', avg_color: '#1976d2' }), 360),
    ];
    const profile = buildProfile(favorites);
    expect(profile.keywords.slice(0, 2)).toEqual(['mountain', 'forest']);
    expect(profile.color).toBe('blue');
    expect(profile.photographers).toEqual([{ username: 'ada', name: 'Ada Lovelace', url: favorites[0]?.author?.url }]);
    const spec = forYouSpec(profile);
    expect(spec?.queries).toContainEqual({ kind: 'unsplash-user', username: 'ada' });
    expect(spec?.queries).toContainEqual({ kind: 'wallhaven', query: 'mountain', sorting: 'relevance' });
    expect(spec?.queries).toContainEqual({ kind: 'unsplash-search', query: 'wallpaper', color: 'blue' });
  });

  it('attend quelques favoris', () => {
    expect(forYouSpec(buildProfile([photo('1', 'cat')]))).toBeNull();
  });
});

describe('fond du jour', () => {
  it('choisit le même fond toute la journée', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(pickOfTheDay(items, '2026-10-02')).toBe(pickOfTheDay(items, '2026-10-02'));
    const days = Array.from({ length: 10 }, (_, i) => pickOfTheDay(items, `2026-10-${String(i + 1).padStart(2, '0')}`));
    expect(new Set(days).size).toBeGreaterThan(1);
    expect(pickOfTheDay([], '2026-10-02')).toBeNull();
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
