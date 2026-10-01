import { useEffect, useRef } from 'react';

/**
 * Pile des gestionnaires du bouton retour Android : le plus récent (feuille, dialogue…)
 * est servi en premier, avant la navigation entre écrans.
 */
const handlers: Array<() => void> = [];

export function pushBackHandler(handler: () => void): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

/** Appelle le gestionnaire le plus récent ; renvoie false s'il n'y en a aucun. */
export function handleBack(): boolean {
  const handler = handlers[handlers.length - 1];
  if (!handler) return false;
  handler();
  return true;
}

export function useBackHandler(active: boolean, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => ref.current());
  }, [active]);
}
