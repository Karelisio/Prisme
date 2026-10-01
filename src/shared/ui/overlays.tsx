import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { useBackHandler } from '@/app/backStack';
import { Button } from './components';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Libellé accessible quand il n'y a pas de titre visible. */
  label?: string;
}

/** Feuille modale inférieure : fermeture par le voile, le bouton retour ou un glissé vers le bas. */
export function BottomSheet({ open, onClose, title, label, children }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; dy: number } | null>(null);
  useBackHandler(open, onClose);

  if (!open) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    const sheet = sheetRef.current;
    if (!sheet || sheet.scrollTop > 0) return;
    drag.current = { startY: e.clientY, dy: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const sheet = sheetRef.current;
    if (!drag.current || !sheet) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY);
    if (drag.current.dy > 8) sheet.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onPointerUp = () => {
    const sheet = sheetRef.current;
    const dy = drag.current?.dy ?? 0;
    drag.current = null;
    if (!sheet) return;
    if (dy > 96) onClose();
    else sheet.style.transform = '';
  };

  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title ?? label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button type="button" className="sheet__handle" aria-label="Fermer" onClick={onClose} />
        {title && <h2 className="sheet__title">{title}</h2>}
        {children}
      </div>
    </>,
    document.body,
  );
}

interface DialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
}

export function Dialog({ open, title, children, confirmLabel, cancelLabel = 'Annuler', onConfirm, onCancel, confirmDisabled }: DialogProps) {
  useBackHandler(open, onCancel);
  if (!open) return null;
  return createPortal(
    <>
      <div className="scrim dialog-scrim" onClick={onCancel} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2 className="dialog__title">{title}</h2>
        {children && <div className="dialog__body">{children}</div>}
        <div className="dialog__actions">
          <Button variant="text" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="text" onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}

interface SnackbarMessage {
  id: number;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface SnackbarState {
  current: SnackbarMessage | null;
  show: (text: string, action?: { label: string; onAction: () => void }) => void;
  dismiss: () => void;
}

let nextSnackbarId = 1;

export const useSnackbar = create<SnackbarState>((set) => ({
  current: null,
  show: (text, action) =>
    set({ current: { id: nextSnackbarId++, text, actionLabel: action?.label, onAction: action?.onAction } }),
  dismiss: () => set({ current: null }),
}));

export const showSnackbar = (text: string, action?: { label: string; onAction: () => void }) =>
  useSnackbar.getState().show(text, action);

export function SnackbarHost() {
  const current = useSnackbar((s) => s.current);
  const dismiss = useSnackbar((s) => s.dismiss);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(dismiss, current.actionLabel ? 6000 : 4000);
    return () => window.clearTimeout(timer);
  }, [current, dismiss]);

  if (!current) return null;
  return (
    <div className="snackbar" role="status" key={current.id}>
      <span className="snackbar__text">{current.text}</span>
      {current.actionLabel && (
        <Button
          variant="text"
          onClick={() => {
            current.onAction?.();
            dismiss();
          }}
        >
          {current.actionLabel}
        </Button>
      )}
    </div>
  );
}
