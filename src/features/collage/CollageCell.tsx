import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from 'react';
import { t } from '@/shared/i18n';
import { Icon, Spinner } from '@/shared/ui/components';
import { type Framing, type Point, panFraming, toCellFrame, zoomFraming } from './framing';
import { type Cell, type Size, photoWindow } from './layouts';

/** Déplacement (px) en deçà duquel un appui reste un simple toucher. */
const TAP_SLOP = 8;
const KEY_PAN_SHARE = 0.06;
const KEY_ZOOM = 1.15;
const WHEEL_SPEED = 0.0018;

export interface CellPhoto {
  framing: Framing;
  /** Taille réelle de l'image décodée ; null tant qu'elle charge ou si elle est indisponible. */
  size: Size | null;
  failed?: boolean;
}

interface CellProps {
  /** Géométrie de la case en pixels CSS d'affichage. */
  cell: Cell;
  photo: CellPhoto | null;
  label: string;
  selected: boolean;
  /** Mode « échanger » : case qui peut recevoir la photo choisie. */
  swapTarget: boolean;
  onTap: () => void;
  onFraming: (framing: Framing) => void;
}

/**
 * Zone tactile d'une case posée sur le canevas : toucher pour choisir ou sélectionner, glisser pour
 * déplacer la photo, pincer ou molette pour zoomer, flèches et + / − au clavier.
 */
export function CollageCell({ cell, photo, label, selected, swapTarget, onTap, onFraming }: CellProps) {
  const ref = useRef<HTMLButtonElement>(null);
  // Dernières valeurs, lues par les gestionnaires : plusieurs événements peuvent arriver avant le prochain rendu.
  const live = useRef({ cell, photo, onFraming });
  live.current = { cell, photo, onFraming };
  const pointers = useRef(new Map<number, Point>());
  const origin = useRef<Point>({ x: 0, y: 0 });
  const moved = useRef(false);
  const interactive = !!photo?.size;

  const update = (change: (framing: Framing, size: Size, view: Size) => Framing) => {
    const { cell: current, photo: shown, onFraming: emit } = live.current;
    if (!shown?.size) return;
    const next = change(shown.framing, shown.size, photoWindow(current));
    live.current = { cell: current, photo: { ...shown, framing: next }, onFraming: emit };
    emit(next);
  };

  /** Point de l'écran, en pixels depuis le centre de la fenêtre photo (dans le repère de la case). */
  const anchorOf = (x: number, y: number): Point => {
    const el = ref.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const { cell: current } = live.current;
    const v = toCellFrame({ x: x - (rect.left + rect.width / 2), y: y - (rect.top + rect.height / 2) }, current.rotation);
    const view = photoWindow(current);
    return { x: v.x - (view.x + view.width / 2), y: v.y - (view.y + view.height / 2) };
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (!interactive || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (pointers.current.size === 0) {
      moved.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
    }
    try {
      // Le doigt peut sortir de la case en glissant : on garde les événements.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointeur déjà terminé : le geste se poursuit sans capture.
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const point = { x: e.clientX, y: e.clientY };
    if (pointers.current.size >= 2) {
      const [a0, b0] = [...pointers.current.values()];
      pointers.current.set(e.pointerId, point);
      const [a1, b1] = [...pointers.current.values()];
      if (!a0 || !b0 || !a1 || !b1) return;
      moved.current = true;
      const before = Math.hypot(a0.x - b0.x, a0.y - b0.y);
      const after = Math.hypot(a1.x - b1.x, a1.y - b1.y);
      const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
      const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
      const shift = toCellFrame({ x: mid1.x - mid0.x, y: mid1.y - mid0.y }, live.current.cell.rotation);
      // Zoom autour du milieu d'avant, puis le milieu qui se déplace entraîne la photo.
      const anchor = anchorOf(mid0.x, mid0.y);
      update((f, size, view) => panFraming(before > 0 ? zoomFraming(f, after / before, anchor, size, view) : f, shift.x, shift.y, size, view));
      return;
    }
    if (!moved.current) {
      if (Math.hypot(point.x - origin.current.x, point.y - origin.current.y) <= TAP_SLOP) return;
      moved.current = true;
    }
    const last = pointers.current.get(e.pointerId) ?? point;
    pointers.current.set(e.pointerId, point);
    const delta = toCellFrame({ x: point.x - last.x, y: point.y - last.y }, live.current.cell.rotation);
    update((f, size, view) => panFraming(f, delta.x, delta.y, size, view));
  };

  const release = (e: PointerEvent<HTMLButtonElement>) => {
    pointers.current.delete(e.pointerId);
    // Le clic qui suit un glissé est ignoré ; le drapeau retombe une fois ce clic passé.
    if (pointers.current.size === 0) window.setTimeout(() => (moved.current = false), 0);
  };

  const onClick = () => {
    if (moved.current) return;
    onTap();
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || !interactive) return;
    // Écouteur natif non passif : preventDefault empêche le zoom de la page avec Ctrl + molette.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const pixels = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
      const anchor = anchorOf(e.clientX, e.clientY);
      update((f, size, view) => zoomFraming(f, Math.exp(-pixels * WHEEL_SPEED), anchor, size, view));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // anchorOf et update ne lisent que des références : leur identité n'importe pas.
  }, [interactive]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    // Les raccourcis du navigateur (Ctrl + « + » pour zoomer la page…) restent à lui.
    if (!interactive || e.ctrlKey || e.metaKey || e.altKey) return;
    const view = photoWindow(live.current.cell);
    const step = KEY_PAN_SHARE * Math.min(view.width, view.height);
    const pan = (dx: number, dy: number) => update((f, size, v) => panFraming(f, dx, dy, size, v));
    const zoom = (factor: number) => update((f, size, v) => zoomFraming(f, factor, { x: 0, y: 0 }, size, v));
    // Les flèches font défiler la vue, comme dans une visionneuse : la photo glisse en sens inverse.
    const actions: Record<string, () => void> = {
      ArrowLeft: () => pan(step, 0),
      ArrowRight: () => pan(-step, 0),
      ArrowUp: () => pan(0, step),
      ArrowDown: () => pan(0, -step),
      '+': () => zoom(KEY_ZOOM),
      '=': () => zoom(KEY_ZOOM),
      '-': () => zoom(1 / KEY_ZOOM),
    };
    const action = actions[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  };

  const loading = !!photo && !photo.size && !photo.failed;
  const classes = [
    'collage-cell',
    !photo && 'collage-cell--empty',
    cell.framed && 'collage-cell--framed',
    swapTarget && 'collage-cell--target',
    interactive && 'collage-cell--movable',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      aria-label={label}
      aria-pressed={selected}
      aria-busy={loading || undefined}
      style={{
        left: cell.cx - cell.width / 2,
        top: cell.cy - cell.height / 2,
        width: cell.width,
        height: cell.height,
        borderRadius: cell.radius,
        transform: cell.rotation ? `rotate(${cell.rotation}rad)` : undefined,
        padding: `${cell.inset.top}px ${cell.inset.right}px ${cell.inset.bottom}px ${cell.inset.left}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {!photo && (
        <span className="collage-cell__empty">
          <Icon name="addPhoto" size={28} />
          <span>{t('Ajouter')}</span>
        </span>
      )}
      {loading && <Spinner size={28} label={t('Chargement de la photo')} />}
      {photo?.failed && (
        <span className="collage-cell__empty">
          <Icon name="error" size={28} />
          <span>{t('Indisponible')}</span>
        </span>
      )}
    </button>
  );
}
