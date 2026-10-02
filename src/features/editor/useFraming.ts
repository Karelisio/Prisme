import { type PointerEvent, useEffect, useRef } from 'react';
import { type Geometry, type Point, type Size, panGeometry, zoomGeometry } from './geometry';

interface FramingOptions {
  /** Les gestes ne servent qu'avec l'outil de cadrage, en mode « Remplir ». */
  enabled: boolean;
  /** Taille de l'image chargée et de la sortie (px) : l'aperçu n'en est qu'une version réduite. */
  source: Size | null;
  output: Size | null;
  geometry: Geometry | undefined;
  onChange: (geometry: Geometry) => void;
}

const WHEEL_SENSITIVITY = 0.0015;

/**
 * Choix libre de la zone de la photo, au doigt (glisser, pincer) et à la souris (glisser, molette).
 * À brancher sur le conteneur de l'aperçu ; le canevas qu'il contient donne les dimensions affichées.
 * Chaque geste part d'un instantané de départ : le résultat ne dépend que de la position des doigts,
 * sans dérive. Les changements sont regroupés par image d'animation.
 */
export function useFraming(options: FramingOptions) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(options);
  latest.current = options;
  // Dernière géométrie connue : celle du parent, ou celle qu'on vient d'émettre et qu'il n'a pas encore rendue.
  const shadow = useRef<Geometry | undefined>(options.geometry);
  const lastProp = useRef<Geometry | undefined>(options.geometry);
  if (options.geometry !== lastProp.current) {
    lastProp.current = options.geometry;
    shadow.current = options.geometry;
  }
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ start: Geometry; points: Point[] } | null>(null);
  const pending = useRef<Geometry | null>(null);
  const frame = useRef(0);

  const emit = (g: Geometry) => {
    shadow.current = g;
    pending.current = g;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const next = pending.current;
      pending.current = null;
      if (next) latest.current.onChange(next);
    });
  };

  const canvasRect = () => ref.current?.querySelector('canvas')?.getBoundingClientRect() ?? null;

  /** Nouveau point de départ : appelé quand le nombre de doigts change. */
  const snapshot = () => {
    const points = [...pointers.current.values()];
    gesture.current = shadow.current && points.length ? { start: shadow.current, points } : null;
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!latest.current.enabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    snapshot();
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { source, output } = latest.current;
    const rect = canvasRect();
    const start = gesture.current;
    if (!start || !source || !output || !rect || rect.width === 0) return;
    // Pixels de l'écran → pixels de sortie.
    const k = output.width / rect.width;
    const [a, b] = [...pointers.current.values()];
    const [a0, b0] = start.points;
    if (!a || !a0) return;
    if (b && b0) {
      const before = Math.hypot(b0.x - a0.x, b0.y - a0.y);
      if (before < 1) return;
      const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
      const mid1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const anchor = { x: (mid0.x - rect.left - rect.width / 2) * k, y: (mid0.y - rect.top - rect.height / 2) * k };
      const zoomed = zoomGeometry(start.start, source, output, Math.hypot(b.x - a.x, b.y - a.y) / before, anchor);
      emit(panGeometry(zoomed, source, output, (mid1.x - mid0.x) * k, (mid1.y - mid0.y) * k));
    } else {
      emit(panGeometry(start.start, source, output, (a.x - a0.x) * k, (a.y - a0.y) * k));
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    snapshot();
  };

  // Molette : écouteur natif, car React enregistre les siens en mode passif (pas de preventDefault).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { enabled, source, output } = latest.current;
      const g = shadow.current;
      const rect = canvasRect();
      if (!enabled || !source || !output || !g || !rect || rect.width === 0) return;
      e.preventDefault();
      const k = output.width / rect.width;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const anchor = { x: (e.clientX - rect.left - rect.width / 2) * k, y: (e.clientY - rect.top - rect.height / 2) * k };
      emit(zoomGeometry(g, source, output, Math.exp(-delta * WHEEL_SENSITIVITY), anchor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // `emit` et `canvasRect` ne dépendent que de refs : l'écouteur n'est posé qu'une fois.
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return {
    ref,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
