import { flushSync } from 'react-dom';

/**
 * Transitions animées entre écrans, par la View Transitions API quand le moteur la fournit
 * (Chromium, WebView récente), sinon par une animation FLIP pour l'élément partagé (la miniature
 * qui s'agrandit en aperçu, et l'inverse) ; les autres écrans gardent alors leur animation CSS
 * d'apparition. Rien n'est animé si l'utilisateur demande moins de mouvement.
 *
 * - forward : un écran s'ouvre par-dessus (glisse et fondu) ;
 * - back : l'écran du dessus se ferme ;
 * - fade : changement d'onglet, ou aperçu ouvert sans miniature (fondu enchaîné) ;
 * - hero-open / hero-close : la miniature d'une grille devient l'aperçu, ou l'inverse.
 *
 * Pendant l'animation, l'attribut `data-vt` de <html> porte le type de transition : les feuilles de
 * style s'en servent pour couper les animations d'apparition des écrans et choisir les mouvements.
 */
export type TransitionKind = 'forward' | 'back' | 'fade' | 'hero-open' | 'hero-close';

/** Élément qui passe d'un écran à l'autre sans disparaître. */
export interface Hero {
  /** Présent avant la mise à jour : la miniature à l'ouverture, la scène de l'aperçu à la fermeture. */
  from: HTMLElement | null;
  /** Présent après la mise à jour (null si absent) : la scène à l'ouverture, la miniature à la fermeture. */
  to: () => HTMLElement | null;
  /** Attendre l'arrivée (écran chargé à la demande qui se monte) : à l'ouverture seulement. */
  waitForTo?: boolean;
}

export interface TransitionOptions {
  kind?: TransitionKind;
  hero?: Hero;
}

/** Durée de l'élément partagé (ms) ; les autres mouvements sont réglés dans global.css. */
export const HERO_MS = 340;
const HERO_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
const HERO_NAME = 'hero';
/** Au-delà, on arrête d'attendre un écran qui tarde à se monter. */
const SETTLE_TIMEOUT = 700;

const motionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export const prefersReducedMotion = (): boolean => motionQuery?.matches ?? false;

export const supportsViewTransitions = (): boolean => typeof document !== 'undefined' && typeof document.startViewTransition === 'function';

/** Mise à jour qui n'a pas encore eu lieu : la transition la reporte au plus tard d'une image. */
interface Run {
  /** Applique tout de suite la mise à jour, sans animation. */
  flush: () => void;
}

let pending: Run | null = null;

/**
 * À appeler avant de lire l'état de la navigation pour décider d'une action : une transition en
 * attente a déjà été demandée (retour pressé deux fois de suite…), son effet doit être visible.
 */
export function flushPendingNavigation(): void {
  const run = pending;
  pending = null;
  run?.flush();
}

/** Attend (par sondage : les minuteurs tournent même quand le rendu est suspendu) qu'un élément existe. */
async function waitFor(find: () => unknown, timeout = SETTLE_TIMEOUT): Promise<void> {
  const start = performance.now();
  while (!find() && performance.now() - start < timeout) await new Promise((resolve) => setTimeout(resolve, 16));
}

const layers = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.overlay-layer')];

/** Conteneur de l'écran au premier plan : la dernière couche superposée, sinon l'onglet actif. */
function frontScreen(): HTMLElement | null {
  return layers().at(-1) ?? document.querySelector<HTMLElement>('.tab[data-active="true"]');
}

/** Scène de l'aperçu au premier plan, une fois dimensionnée. */
export function previewStage(): HTMLElement | null {
  const stage = layers().at(-1)?.querySelector<HTMLElement>('.preview__stage') ?? null;
  return stage && stage.offsetWidth > 0 ? stage : null;
}

/** Miniature d'un fond dans l'écran qui se trouve sous l'aperçu au premier plan (ou, sans aperçu, au premier plan). */
export function thumbnailBelowPreview(id: string): HTMLElement | null {
  const all = layers();
  const preview = all.findLast((layer) => layer.querySelector('.preview'));
  const index = preview ? all.indexOf(preview) : all.length;
  const below = index > 0 ? all[index - 1] : document.querySelector<HTMLElement>('.tab[data-active="true"]');
  const cell = [...(below?.querySelectorAll<HTMLElement>('.wp-cell[data-wp]') ?? [])].find((el) => el.dataset.wp === id) ?? null;
  return cell && isMostlyVisible(cell) ? cell : null;
}

/** Une miniature repoussée hors de l'écran (grille défilée, aperçu feuilleté) ne sert pas de point d'arrivée. */
function isMostlyVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
  const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
  return visibleHeight >= rect.height * 0.5 && visibleWidth >= rect.width * 0.5;
}

/** Attend que l'écran qui vient de s'ouvrir soit monté (les écrans chargés à la demande arrivent un instant plus tard). */
async function settle(kind: TransitionKind, hero?: Hero): Promise<void> {
  if (hero?.waitForTo) await waitFor(hero.to);
  else if (kind === 'forward' || kind === 'fade') await waitFor(() => frontScreen()?.firstElementChild);
}

/**
 * Exécute `update` (qui change l'état de la navigation) avec la transition demandée.
 * Sans transition possible, la mise à jour a lieu immédiatement.
 */
export function runTransition(update: () => void, options: TransitionOptions = {}): void {
  flushPendingNavigation();
  const { kind = 'forward', hero } = options;
  if (typeof document === 'undefined' || prefersReducedMotion()) {
    update();
    return;
  }
  if (supportsViewTransitions()) {
    viewTransition(update, kind, hero);
  } else if (hero) {
    void flipTransition(update, kind, hero);
  } else {
    update();
  }
}

function viewTransition(update: () => void, kind: TransitionKind, hero?: Hero): void {
  const root = document.documentElement;
  let applied = false;
  let skipped = false;
  const named = new Set<HTMLElement>();
  const apply = () => {
    if (applied) return;
    applied = true;
    flushSync(update);
  };
  const name = (el: HTMLElement | null) => {
    if (!el) return;
    el.style.setProperty('view-transition-name', HERO_NAME);
    named.add(el);
  };
  const cleanup = () => {
    delete root.dataset.vt;
    for (const el of named) el.style.removeProperty('view-transition-name');
    named.clear();
    if (pending === run) pending = null;
  };

  let transition: ViewTransition;
  const run: Run = {
    flush: () => {
      skipped = true;
      cleanup();
      apply();
      transition?.skipTransition();
    },
  };

  root.dataset.vt = kind;
  name(hero?.from ?? null);
  try {
    transition = document.startViewTransition(async () => {
      if (skipped) return;
      if (pending === run) pending = null;
      // Le départ ne doit plus porter le nom au moment de capturer l'arrivée : deux éléments du même nom l'annuleraient.
      for (const el of named) el.style.removeProperty('view-transition-name');
      named.clear();
      apply();
      await settle(kind, hero);
      if (!skipped) name(hero?.to() ?? null);
    });
  } catch {
    cleanup();
    apply();
    return;
  }
  pending = run;
  // Les promesses d'une transition ignorée (une autre démarre, page masquée) sont rejetées : sans effet ici.
  transition.ready.catch(() => undefined);
  transition.updateCallbackDone.catch(() => undefined);
  transition.finished.then(cleanup, cleanup);
}

/** Boîte en pixels d'un élément (px relatifs à la fenêtre). */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Image « repliée » d'un élément qui doit s'afficher à la place d'une autre boîte : mise à l'échelle
 * uniforme (pas de déformation), décalée au centre de la cible, et rognée au format de la cible.
 * `radius` est celui des coins de la cible. Null si une des boîtes est vide.
 */
export function collapsedFrame(stage: Box, target: Box, radius = 0) {
  if (!(stage.width > 0 && stage.height > 0 && target.width > 0 && target.height > 0)) return null;
  const scale = Math.max(target.width / stage.width, target.height / stage.height);
  return {
    scale,
    dx: target.x + target.width / 2 - (stage.x + stage.width / 2),
    dy: target.y + target.height / 2 - (stage.y + stage.height / 2),
    // Le rognage s'exprime dans le repère de la scène, avant la mise à l'échelle.
    insetX: (stage.width - target.width / scale) / 2,
    insetY: (stage.height - target.height / scale) / 2,
    radius: radius / scale,
  };
}

const EXPANDED = { transform: 'none', clipPath: 'inset(0px 0px 0px 0px round 0px)' };

function collapsedKeyframe(frame: NonNullable<ReturnType<typeof collapsedFrame>>) {
  return {
    transform: `translate(${frame.dx}px, ${frame.dy}px) scale(${frame.scale})`,
    clipPath: `inset(${frame.insetY}px ${frame.insetX}px ${frame.insetY}px ${frame.insetX}px round ${frame.radius}px)`,
  };
}

/** Anime la scène entre la boîte de la miniature et sa place ; renvoie la fin de l'animation. */
function playHero(stage: HTMLElement, target: DOMRect, direction: 'open' | 'close'): Promise<unknown> {
  const frame = collapsedFrame(stage.getBoundingClientRect(), target, 12);
  if (!frame) return Promise.resolve();
  const collapsed = collapsedKeyframe(frame);
  const opening = direction === 'open';
  const timing: KeyframeAnimationOptions = { duration: HERO_MS, easing: HERO_EASING, fill: 'both' };
  const animations = [stage.animate(opening ? [collapsed, EXPANDED] : [EXPANDED, collapsed], timing)];
  const preview = stage.closest<HTMLElement>('.preview');
  if (preview) {
    // Le fond noir de l'aperçu apparaît (ou se retire) pendant que la miniature grandit (ou rétrécit).
    const fade = [{ backgroundColor: 'rgb(0 0 0 / 0)' }, { backgroundColor: 'rgb(0 0 0 / 1)' }];
    animations.push(preview.animate(opening ? fade : [...fade].reverse(), timing));
    const controls = preview.querySelectorAll<HTMLElement>('.preview__top, .preview__bottom');
    for (const el of controls) {
      const appear = [{ opacity: 0 }, { opacity: 1 }];
      animations.push(el.animate(opening ? appear : [...appear].reverse(), { ...timing, duration: HERO_MS * 0.6, delay: opening ? HERO_MS * 0.4 : 0 }));
    }
  }
  return Promise.allSettled(animations.map((a) => a.finished)).then(() => {
    // À la fermeture, l'état final est conservé jusqu'au démontage de l'aperçu ; à l'ouverture il est rendu à la feuille de style.
    if (opening) for (const a of animations) a.cancel();
  });
}

/** Sans View Transitions : la même transition de l'élément partagé, animée à la main (technique FLIP). */
async function flipTransition(update: () => void, kind: TransitionKind, hero: Hero): Promise<void> {
  const root = document.documentElement;
  let applied = false;
  let skipped = false;
  const apply = () => {
    if (applied) return;
    applied = true;
    flushSync(update);
  };
  const run: Run = {
    flush: () => {
      skipped = true;
      delete root.dataset.vt;
      apply();
    },
  };
  root.dataset.vt = kind;
  try {
    if (kind === 'hero-open') {
      const from = hero.from?.getBoundingClientRect();
      apply();
      await waitFor(hero.to);
      const stage = hero.to();
      if (stage && from && !skipped) await playHero(stage, from, 'open');
    } else {
      // Fermeture : la miniature se trouve déjà sous l'aperçu, on rétrécit la scène vers elle avant de le démonter.
      const target = hero.to()?.getBoundingClientRect();
      if (hero.from && target) {
        pending = run;
        await playHero(hero.from, target, 'close');
        if (pending === run) pending = null;
      }
      if (!skipped) apply();
    }
  } finally {
    if (!skipped) delete root.dataset.vt;
  }
}
