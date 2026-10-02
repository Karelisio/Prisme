import type { WallpaperTarget } from '@/shared/native';
import type { NativeQuote, QuoteConfig, QuoteStatus } from '@/shared/native/quote';
import type { IconName } from '@/shared/ui/icons';
import type { QuoteColor, QuoteFont, QuotePosition, QuoteSize } from './layout';
import { PROVERBS } from './proverbs';
import { dayNumberOf, pickIndex } from './selection';

/** D'où viennent les phrases : les proverbes intégrés, les citations de l'utilisateur, ou les deux. */
export type QuoteSource = 'proverbs' | 'mine' | 'both';

/** Longueurs maximales : une phrase doit rester lisible sur un fond d'écran. */
export const MAX_QUOTE_TEXT = 220;
export const MAX_QUOTE_AUTHOR = 60;
export const MAX_CUSTOM_QUOTES = 200;

/** Citation ajoutée par l'utilisateur dans « Mes citations ». */
export interface CustomQuote {
  id: string;
  text: string;
  author?: string;
}

/** Choix de l'utilisateur ; l'option elle-même (activée ou non) est dans les réglages, `features.quote`. */
export interface QuotePrefs {
  /** Écran(s) qui reçoivent la phrase (le verrouillage par défaut). */
  target: WallpaperTarget;
  source: QuoteSource;
  font: QuoteFont;
  position: QuotePosition;
  size: QuoteSize;
  color: QuoteColor;
  /** Crans avancés par « Une autre » : la suite des phrases saute d'autant, sans jamais en répéter. */
  shift: number;
  custom: CustomQuote[];
}

export const DEFAULT_QUOTE_PREFS: QuotePrefs = {
  target: 'lock',
  source: 'proverbs',
  font: 'serif',
  position: 'bottom',
  size: 'medium',
  color: 'auto',
  shift: 0,
  custom: [],
};

/** Texte et auteur nettoyés et bornés ; null si le texte est vide. */
export function cleanQuote(text: string, author?: string): { text: string; author?: string } | null {
  const body = text.replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE_TEXT).trim();
  if (!body) return null;
  const by = (author ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE_AUTHOR).trim();
  return by ? { text: body, author: by } : { text: body };
}

export function newQuoteId(): string {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Phrases en lice selon la source. Sans citation perso, « Mes citations » retombe sur les proverbes : il y a
 * toujours une phrase à poser.
 */
export function activeQuotes(source: QuoteSource, custom: readonly CustomQuote[]): NativeQuote[] {
  const mine = custom.flatMap((quote) => {
    const cleaned = cleanQuote(quote.text, quote.author);
    return cleaned ? [cleaned] : [];
  });
  const proverbs = PROVERBS.map((text) => ({ text }));
  const list = source === 'proverbs' ? proverbs : source === 'mine' ? mine : [...proverbs, ...mine];
  return list.length > 0 ? list : proverbs;
}

/** Phrase du jour : la même que celle que le natif posera, d'après le calendrier local de `date`. */
export function quoteOfTheDay(list: readonly NativeQuote[], date: Date, shift: number): NativeQuote | null {
  return list[pickIndex(dayNumberOf(date), shift, list.length)] ?? null;
}

const sameQuote = (a: { text: string; author?: string }, b: { text: string; author?: string }) => a.text === b.text && (a.author ?? '') === (b.author ?? '');

/** Remet une citation à sa place (annulation d'une suppression) ; sans effet si elle y est déjà. */
export function insertQuote(list: readonly CustomQuote[], quote: CustomQuote, index: number): CustomQuote[] {
  if (list.some((q) => q.id === quote.id)) return [...list];
  const out = [...list];
  out.splice(Math.min(Math.max(index, 0), out.length), 0, quote);
  return out;
}

/** Réunit les citations d'une sauvegarde aux actuelles : rien n'est retiré, les doublons (même id ou même texte) sont ignorés. */
export function mergeCustomQuotes(current: readonly CustomQuote[], incoming: readonly CustomQuote[]): CustomQuote[] {
  const out = [...current];
  for (const quote of incoming) {
    if (out.length >= MAX_CUSTOM_QUOTES) break;
    if (out.some((q) => q.id === quote.id || sameQuote(q, quote))) continue;
    out.push(quote);
  }
  return out;
}

/** Réglages envoyés au natif. Coupée, l'option n'envoie pas de phrases : il n'a plus rien à poser. */
export function buildQuoteConfig(enabled: boolean, prefs: QuotePrefs): QuoteConfig {
  return {
    enabled,
    target: prefs.target,
    font: prefs.font,
    position: prefs.position,
    size: prefs.size,
    color: prefs.color,
    shift: Math.max(0, Math.floor(prefs.shift)),
    quotes: enabled ? activeQuotes(prefs.source, prefs.custom) : [],
  };
}

/** Libellés en français (données) : `t(label)` à l'affichage. */
export const SOURCE_CHOICES: readonly { value: QuoteSource; label: string }[] = [
  { value: 'proverbs', label: 'Proverbes' },
  { value: 'mine', label: 'Mes citations' },
  { value: 'both', label: 'Les deux' },
];

export const FONT_CHOICES: readonly { value: QuoteFont; label: string }[] = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans-serif' },
];

export const POSITION_CHOICES: readonly { value: QuotePosition; label: string }[] = [
  { value: 'top', label: 'Haut' },
  { value: 'center', label: 'Centre' },
  { value: 'bottom', label: 'Bas' },
];

export const SIZE_CHOICES: readonly { value: QuoteSize; label: string }[] = [
  { value: 'small', label: 'Petite' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'large', label: 'Grande' },
];

export const COLOR_CHOICES: readonly { value: QuoteColor; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'white', label: 'Blanc' },
  { value: 'black', label: 'Noir' },
];

/** Ce que l'écran annonce : option coupée, fond animé actif, aucun fond posé par Prisme, un seul écran prêt, ou tout est prêt. */
export type QuoteStatusKind = 'off' | 'live' | 'none' | 'partial' | 'ready';

export function quoteStatusKind(status: QuoteStatus, enabled: boolean, target: WallpaperTarget): QuoteStatusKind {
  if (!enabled) return 'off';
  const wanted = [
    ...(target !== 'lock' ? [{ original: status.home, live: status.homeLive }] : []),
    ...(target !== 'home' ? [{ original: status.lock, live: status.lockLive }] : []),
  ];
  const ready = wanted.map((screen) => screen.original && !screen.live);
  if (ready.every(Boolean)) return 'ready';
  if (ready.some(Boolean)) return 'partial';
  return wanted.some((screen) => screen.live) ? 'live' : 'none';
}

/** Textes en français (données) : `t(text)` à l'affichage. */
export const QUOTE_STATUS: Record<QuoteStatusKind, { icon: IconName; text: string }> = {
  off: { icon: 'info', text: 'Option désactivée : active-la pour poser la phrase du jour' },
  live: { icon: 'info', text: 'Un fond animé est actif : la phrase n’y est pas ajoutée' },
  none: {
    icon: 'info',
    text: 'Pose d’abord un fond depuis Prisme (aperçu, puis Appliquer) : la phrase s’y ajoute. Un fond posé autrement n’est pas modifié.',
  },
  partial: { icon: 'info', text: 'Un des deux écrans ne peut pas la recevoir pour l’instant (aucun fond posé par Prisme, ou fond animé actif)' },
  ready: { icon: 'checkCircle', text: 'Prêt : nouvelle phrase chaque matin vers 6 h' },
};
