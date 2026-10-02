import { create } from 'zustand';
import { EN } from './en';

/**
 * Traductions de l'interface. Le texte français sert de clé : `t('Fonds animés')` renvoie le texte de
 * la langue choisie, ou le français s'il manque une traduction. Les variables s'écrivent `{nom}` :
 * `t('{count} fonds en rotation', { count })`.
 */
export type Language = 'fr' | 'en';

/** Réglage de l'utilisateur : la langue du téléphone, ou une langue imposée. */
export type LanguagePref = 'system' | Language;

const TABLES: Record<Exclude<Language, 'fr'>, Readonly<Record<string, string>>> = { en: EN };

/** Langue du système : français s'il est en tête des langues préférées, sinon anglais. */
export function detectLanguage(languages: readonly string[] = typeof navigator === 'undefined' ? ['fr'] : navigator.languages ?? [navigator.language]): Language {
  const first = languages.find(Boolean)?.toLowerCase() ?? 'fr';
  return first.startsWith('fr') ? 'fr' : 'en';
}

export function resolveLanguage(pref: LanguagePref, languages?: readonly string[]): Language {
  return pref === 'system' ? detectLanguage(languages) : pref;
}

export const useLanguage = create<{ language: Language }>(() => ({ language: 'fr' }));

let current: Language = 'fr';

/** Change la langue de l'interface ; les composants qui utilisent `useT` se redessinent. */
export function setLanguage(language: Language) {
  current = language;
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  useLanguage.setState({ language });
}

export function getLanguage(): Language {
  return current;
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** Texte [fr] dans la langue de l'interface, variables `{nom}` remplacées. */
export function t(fr: string, vars?: Record<string, string | number>): string {
  return fill(current === 'fr' ? fr : (TABLES[current][fr] ?? fr), vars);
}

/** Accord simple : [one] pour 0 ou 1 (règle française), [other] sinon ; `{count}` vaut [count]. */
export function tn(count: number, one: string, other: string, vars?: Record<string, string | number>): string {
  const english = current === 'en';
  const singular = english ? count === 1 : count <= 1;
  return t(singular ? one : other, { count, ...vars });
}

/** `t` dans un composant : il se redessine quand la langue change. */
export function useT(): typeof t {
  useLanguage((s) => s.language);
  return t;
}

/** Locale pour les dates et les nombres (`toLocaleDateString`, `Intl`). */
export function locale(): string {
  return current === 'fr' ? 'fr-FR' : 'en-GB';
}
