import { useState } from 'react';
import { t } from '@/shared/i18n';
import { Button, Icon, IconButton, ListItem } from '@/shared/ui/components';
import { BottomSheet, showSnackbar, undoLabel } from '@/shared/ui/overlays';
import { type CustomQuote, MAX_CUSTOM_QUOTES, MAX_QUOTE_AUTHOR, MAX_QUOTE_TEXT } from './model';
import { useQuotePrefs } from './store';

const short = (text: string) => (text.length > 28 ? `${text.slice(0, 28).trimEnd()}…` : text);

/** Ajout et modification d'une citation : le texte (obligatoire) et l'auteur (facultatif). */
function QuoteEditor({ quote, onClose }: { quote: CustomQuote | 'new' | null; onClose: () => void }) {
  const add = useQuotePrefs((s) => s.addQuote);
  const edit = useQuotePrefs((s) => s.editQuote);
  const editing = quote && quote !== 'new' ? quote : null;
  // Le formulaire repart de la citation choisie à chaque ouverture (la feuille se démonte à la fermeture).
  const [text, setText] = useState(editing?.text ?? '');
  const [author, setAuthor] = useState(editing?.author ?? '');

  const save = () => {
    const saved = editing ? edit(editing.id, text, author) : add(text, author) !== null;
    if (!saved) return;
    showSnackbar(editing ? t('Citation modifiée') : t('Citation ajoutée'));
    onClose();
  };

  return (
    <BottomSheet open={quote !== null} onClose={onClose} title={editing ? t('Modifier la citation') : t('Nouvelle citation')}>
      <form
        className="sheet__form quote-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="text-field quote-form__field">
          <label className="text-field__label" htmlFor="quote-text">
            {t('Citation')}
          </label>
          <textarea id="quote-text" value={text} maxLength={MAX_QUOTE_TEXT} rows={4} autoFocus onChange={(e) => setText(e.target.value)} />
          <span className="quote-form__count" aria-hidden="true">
            {text.length} / {MAX_QUOTE_TEXT}
          </span>
        </div>
        <div className="text-field quote-form__field">
          <label className="text-field__label" htmlFor="quote-author">
            {t('Auteur (facultatif)')}
          </label>
          <input id="quote-author" value={author} maxLength={MAX_QUOTE_AUTHOR} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div className="sheet__actions">
          <Button variant="text" onClick={onClose}>
            {t('Annuler')}
          </Button>
          <Button type="submit" disabled={!text.trim()}>
            {t('Enregistrer')}
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}

/** « Mes citations » : liste, ajout, modification et suppression (avec annulation). */
export function MyQuotes() {
  const custom = useQuotePrefs((s) => s.custom);
  const remove = useQuotePrefs((s) => s.removeQuote);
  const restore = useQuotePrefs((s) => s.restoreQuote);
  const [editor, setEditor] = useState<CustomQuote | 'new' | null>(null);
  const full = custom.length >= MAX_CUSTOM_QUOTES;

  const removeWithUndo = (quote: CustomQuote) => {
    const index = custom.findIndex((q) => q.id === quote.id);
    remove(quote.id);
    showSnackbar(t('Citation supprimée'), { label: undoLabel(), onAction: () => restore(quote, index) });
  };

  return (
    <section className="option-block" aria-labelledby="my-quotes-title">
      <h2 className="option-block__title" id="my-quotes-title">
        {custom.length > 0 ? t('Mes citations ({count})', { count: custom.length }) : t('Mes citations')}
      </h2>
      <p className="option-hint quote-hint">
        {t('Ajoute tes propres phrases (un mot doux, une devise…) puis choisis « Mes citations » ou « Les deux » comme source.')}
      </p>
      {custom.length > 0 && (
        <ul className="list quote-list">
          {custom.map((quote) => (
            <li key={quote.id}>
              <ListItem
                leading={<Icon name="formatQuote" />}
                headline={<span className="quote-list__text">{quote.text}</span>}
                supporting={quote.author ? `— ${quote.author}` : undefined}
                trailing={
                  <span className="quote-list__actions">
                    <IconButton icon="edit" label={t('Modifier la citation « {text} »', { text: short(quote.text) })} onClick={() => setEditor(quote)} />
                    <IconButton icon="delete" label={t('Supprimer la citation « {text} »', { text: short(quote.text) })} onClick={() => removeWithUndo(quote)} />
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}
      <div className="option-actions quote-actions">
        <Button variant="tonal" icon="add" disabled={full} onClick={() => setEditor('new')}>
          {t('Ajouter une citation')}
        </Button>
      </div>
      {full && <p className="option-hint">{t('Limite de {max} citations atteinte : supprime-en pour en ajouter.', { max: MAX_CUSTOM_QUOTES })}</p>}
      {/* Remonté à chaque ouverture : le formulaire repart de la citation choisie. */}
      <QuoteEditor key={editor === null ? 'closed' : editor === 'new' ? 'new' : editor.id} quote={editor} onClose={() => setEditor(null)} />
    </section>
  );
}
