import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type CustomQuote,
  DEFAULT_QUOTE_PREFS,
  MAX_CUSTOM_QUOTES,
  type QuotePrefs,
  cleanQuote,
  insertQuote,
  mergeCustomQuotes,
  newQuoteId,
} from './model';

type Settings = Omit<QuotePrefs, 'custom' | 'shift'>;

interface QuoteActions {
  update: (patch: Partial<Settings>) => void;
  /** « Une autre » : avance la suite des phrases d'un cran. */
  another: () => void;
  /** Ajoute une citation ; renvoie son identifiant, ou null si le texte est vide ou la liste pleine. */
  addQuote: (text: string, author?: string) => string | null;
  /** Modifie une citation ; faux si le texte est vide ou la citation inconnue. */
  editQuote: (id: string, text: string, author?: string) => boolean;
  removeQuote: (id: string) => void;
  /** Remet une citation supprimée à sa place (annulation). */
  restoreQuote: (quote: CustomQuote, index: number) => void;
  /** Restauration d'une sauvegarde : rien n'est retiré, les doublons sont ignorés. */
  mergeCustom: (incoming: readonly CustomQuote[]) => void;
}

/** Réglages de la phrase du jour et citations perso : gardés sur le téléphone, puis envoyés au natif (voir quoteSync). */
export const useQuotePrefs = create<QuotePrefs & QuoteActions>()(
  persist(
    (set, get) => ({
      ...DEFAULT_QUOTE_PREFS,
      update: (patch) => set(patch),
      another: () => set((s) => ({ shift: s.shift + 1 })),
      addQuote: (text, author) => {
        const cleaned = cleanQuote(text, author);
        if (!cleaned || get().custom.length >= MAX_CUSTOM_QUOTES) return null;
        const id = newQuoteId();
        set((s) => ({ custom: [...s.custom, { id, ...cleaned }] }));
        return id;
      },
      editQuote: (id, text, author) => {
        const cleaned = cleanQuote(text, author);
        if (!cleaned || !get().custom.some((q) => q.id === id)) return false;
        set((s) => ({ custom: s.custom.map((q) => (q.id === id ? { id, ...cleaned } : q)) }));
        return true;
      },
      removeQuote: (id) => set((s) => ({ custom: s.custom.filter((q) => q.id !== id) })),
      restoreQuote: (quote, index) => set((s) => ({ custom: insertQuote(s.custom, quote, index) })),
      mergeCustom: (incoming) => set((s) => ({ custom: mergeCustomQuotes(s.custom, incoming) })),
    }),
    {
      name: 'prisme-quote',
      version: 1,
      partialize: ({ target, source, font, position, size, color, shift, custom }) => ({ target, source, font, position, size, color, shift, custom }),
    },
  ),
);
