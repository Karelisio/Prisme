export type WallpaperSource = 'unsplash' | 'pexels' | 'wallhaven' | 'pixabay' | 'art' | 'nasa' | 'pack' | 'device' | 'creation';

/** Sources en ligne interrogées par les flux. */
export type RemoteSource = 'unsplash' | 'pexels' | 'wallhaven' | 'pixabay' | 'art' | 'nasa';

export interface Author {
  name: string;
  url: string;
  /** Unsplash : identifiant du photographe, pour afficher et suivre ses photos. */
  username?: string;
}

/** Fond d'écran normalisé, quelle que soit sa source. */
export interface Wallpaper {
  /** `${source}:${identifiant}` : unique toutes sources confondues. */
  id: string;
  source: WallpaperSource;
  width: number;
  height: number;
  /** Couleur moyenne, affichée pendant le chargement. */
  color: string;
  alt: string;
  /** Miniature basse résolution pour la grille. */
  thumb: string;
  /** Image d'aperçu (~1080 px de large). */
  preview: string;
  /** Image haute résolution utilisée pour l'application (ou chemin local). */
  full: string;
  author?: Author;
  /** Page de la photo chez le fournisseur. */
  pageUrl?: string;
  /** Unsplash : à appeler quand la photo est appliquée (exigence de l'API). */
  downloadLocation?: string;
}

export type ColorFilter =
  | 'black'
  | 'white'
  | 'gray'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'black_and_white';

export type RatioFilter = 'all' | 'screen' | 'tall' | 'standard' | 'wide';

/** Couleur filtrée : une teinte nommée, ou un code « #rrggbb » choisi au nuancier. */
export type ColorChoice = ColorFilter | `#${string}`;

export interface Filters {
  color: ColorChoice | null;
  ratio: RatioFilter;
  /** Fonds très sombres (noirs profonds, économes sur écran OLED). */
  amoled: boolean;
}

export const DEFAULT_FILTERS: Filters = { color: null, ratio: 'all', amoled: false };

/** Page de résultats d'une source : `next` vaut null quand il n'y a plus rien. */
export interface SourcePage {
  items: Wallpaper[];
  next: number | null;
}

export type ApiErrorKind = 'missing_key' | 'auth' | 'rate_limit' | 'network' | 'server';

export class ApiError extends Error {
  constructor(
    readonly source: RemoteSource | 'packs',
    readonly kind: ApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
