import { type MouseEvent, type PointerEvent, useRef } from 'react';
import { haptic } from './haptics';

/** Durée d'appui pour un appui long, et distance au-delà de laquelle le geste devient un défilement. */
const DELAY_MS = 500;
const SLOP_PX = 10;

/**
 * Appui long sur un élément : `onLongPress` est appelé après 500 ms sans bouger, avec un retour
 * haptique, et le clic qui suivrait le relâchement est annulé. Sans `onLongPress`, ne fait rien.
 */
export function useLongPress(onLongPress: (() => void) | undefined) {
  const timer = useRef<number | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const callback = useRef(onLongPress);
  callback.current = onLongPress;

  const cancel = () => {
    window.clearTimeout(timer.current);
    origin.current = null;
  };

  if (!onLongPress) return {};
  return {
    onPointerDown: (e: PointerEvent) => {
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        fired.current = true;
        origin.current = null;
        haptic('long');
        callback.current?.();
      }, DELAY_MS);
    },
    onPointerMove: (e: PointerEvent) => {
      const start = origin.current;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    // Le menu contextuel du navigateur (appui long sur une image) n'a rien à faire ici.
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
    onClickCapture: (e: MouseEvent) => {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
