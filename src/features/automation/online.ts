import { CATEGORIES, searchFeed } from '@/features/browse/categories';
import type { Hidden } from '@/features/discover/hidden';
import { buildProfile, forYouSpec } from '@/features/discover/profile';
import { type FeedSpec, resolveQueries } from '@/features/sources/feed';
import type { SourceToggles } from '@/features/sources/registry';
import { DEFAULT_FILTERS, type Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import type { NativeOnlineConfig, NativeOnlineQuery } from '@/shared/native/automation';

/** Source de rotation « en ligne » : des fonds pris au hasard chez les sources, selon un thème. */
export const ONLINE_SOURCE = 'online';

export interface OnlineRotationPrefs {
  /** Clé d'une catégorie de l'Explorer, « foryou » ou « custom » (mot-clé). */
  theme: string;
  keyword: string;
  /** Pas de nouveau fond sur données mobiles. */
  wifiOnly: boolean;
}

export const DEFAULT_ONLINE: OnlineRotationPrefs = { theme: 'featured', keyword: '', wifiOnly: false };

/** Tendances et Nouveautés n'ont pas de sens au hasard : on garde les thèmes. */
const NOT_RANDOM = new Set(['featured', 'trending', 'latest']);

/** Libellés en français (données) : `t(label)` à l'affichage. */
export const ONLINE_THEMES: readonly { key: string; label: string }[] = [
  { key: 'featured', label: 'Fonds d’écran' },
  { key: 'foryou', label: 'Pour toi' },
  ...CATEGORIES.filter((c) => !NOT_RANDOM.has(c.key)).map((c) => ({ key: c.key, label: c.label })),
  { key: 'custom', label: 'Mot-clé…' },
];

/** Thème de la rotation en ligne, dans la langue de l'interface (le mot-clé choisi reste tel quel). */
export function onlineThemeLabel(prefs: OnlineRotationPrefs): string {
  if (prefs.theme === 'custom') return prefs.keyword.trim() ? t('« {keyword} »', { keyword: prefs.keyword.trim() }) : t('mot-clé à choisir');
  return t(ONLINE_THEMES.find((theme) => theme.key === prefs.theme)?.label ?? 'Fonds d’écran');
}

/** Ce que la rotation en ligne cherche : catégorie, goûts tirés des favoris ou mot-clé. */
export function onlineSpec(prefs: OnlineRotationPrefs, favorites: Wallpaper[]): FeedSpec {
  const keyword = prefs.keyword.trim();
  if (prefs.theme === 'custom' && keyword) return searchFeed(keyword);
  if (prefs.theme === 'foryou') {
    const spec = forYouSpec(buildProfile(favorites));
    if (spec) return spec;
  }
  return CATEGORIES.find((c) => c.key === prefs.theme) ?? (CATEGORIES[0] as FeedSpec);
}

export interface OnlineContext {
  /** Sources activées et utilisables avec ce build. */
  sources: SourceToggles;
  keys: { unsplash: string; pexels: string };
  hidden: Hidden;
  favorites: Wallpaper[];
}

/**
 * Requêtes envoyées au natif, qui tire ses fonds au hasard : Unsplash « random », Wallhaven
 * « random », pages au hasard ailleurs. Pixabay est écarté (1280 px au plus).
 */
export function onlineQueries(spec: FeedSpec, ctx: Pick<OnlineContext, 'sources' | 'keys'>): NativeOnlineQuery[] {
  const unsplash = `Client-ID ${ctx.keys.unsplash}`;
  const out: NativeOnlineQuery[] = [];
  for (const q of resolveQueries(spec, { filters: DEFAULT_FILTERS, sources: ctx.sources })) {
    switch (q.kind) {
      case 'unsplash-topic':
        out.push({ provider: 'unsplash', query: spec.searchQuery ?? q.slug, auth: unsplash });
        break;
      case 'unsplash-search':
        out.push({ provider: 'unsplash', query: q.query, auth: unsplash });
        break;
      case 'unsplash-user':
        out.push({ provider: 'unsplash', username: q.username, auth: unsplash });
        break;
      case 'pexels-curated':
        out.push({ provider: 'pexels', auth: ctx.keys.pexels });
        break;
      case 'pexels-search':
        out.push({ provider: 'pexels', query: q.query, auth: ctx.keys.pexels });
        break;
      case 'wallhaven':
        out.push({ provider: 'wallhaven', query: q.query ?? '', categories: q.categories ?? '111' });
        break;
      case 'art':
        out.push({ provider: 'art', query: q.query ?? '' });
        break;
      case 'nasa':
        out.push({ provider: 'nasa', query: q.query });
        break;
      default:
        break;
    }
  }
  const seen = new Set<string>();
  return out.filter((q) => {
    const key = JSON.stringify(q);
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

export function onlineConfig(prefs: OnlineRotationPrefs, ctx: OnlineContext): NativeOnlineConfig | undefined {
  const queries = onlineQueries(onlineSpec(prefs, ctx.favorites), ctx);
  if (queries.length === 0) return undefined;
  return {
    // Seul un changement de thème remet la file à zéro (et change le fond tout de suite).
    key: `${prefs.theme}:${prefs.theme === 'custom' ? prefs.keyword.trim().toLowerCase() : ''}`,
    queries,
    wifiOnly: prefs.wifiOnly,
    exclude: {
      ids: Object.keys(ctx.hidden.hiddenIds),
      authors: Object.keys(ctx.hidden.hiddenAuthors),
      words: ctx.hidden.hiddenWords,
    },
  };
}
