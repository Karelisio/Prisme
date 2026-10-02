import { useState } from 'react';
import { t } from '@/shared/i18n';
import { Dialog } from '@/shared/ui/overlays';
import { showReceived } from './receive';
import { ShareError, parseSharedInput } from './share';
import './library.css';

/** « Coller un code » : accepte le code seul, le lien « prisme:// » ou le message de partage entier. */
export function PasteCodeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setError(null);
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    try {
      const { code, collection } = await parseSharedInput(text);
      setText('');
      close();
      showReceived(code, collection);
    } catch (e) {
      setError(t(e instanceof ShareError ? e.message : 'Impossible de lire ce code'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} title={t('Coller un code')} confirmLabel={t('Ouvrir')} confirmDisabled={!text.trim() || busy} onConfirm={() => void submit()} onCancel={close}>
      <label className="paste">
        <span className="text-field__label">{t('Code, lien ou message de partage')}</span>
        <textarea
          className="paste__input"
          value={text}
          rows={4}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={error !== null}
        />
      </label>
      {error ? (
        <p className="paste__message paste__message--error" role="alert">
          {error}
        </p>
      ) : (
        <p className="paste__message">{t('Colle ce que tu as reçu : le message entier fonctionne aussi.')}</p>
      )}
    </Dialog>
  );
}
