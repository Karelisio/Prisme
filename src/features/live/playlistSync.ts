import { App as CapacitorApp } from '@capacitor/app';
import { useLibrary } from '@/features/library/store';
import { applyUri } from '@/features/library/useImageSrc';
import { useSettings } from '@/features/settings/store';
import { isNative } from '@/shared/native';
import { PrismeLive } from '@/shared/native/automation';
import { useLive } from './live';
import { PLAYLIST_OFF, buildPlaylist } from './playlist';

const OFF = JSON.stringify(PLAYLIST_OFF);

// Au départ le natif n'a rien : une liste coupée n'est donc jamais envoyée pour rien.
let lastSent = OFF;
let timer: number | undefined;

/** Envoie la liste au natif, seulement si son contenu a changé depuis le dernier envoi. */
async function push() {
  const library = useLibrary.getState();
  if (!library.hydrated) return;
  const playlist = buildPlaylist(useLive.getState().unlock, useSettings.getState().features.live, library, applyUri);
  const json = JSON.stringify(playlist);
  if (json === lastSent) return;
  lastSent = json;
  try {
    await PrismeLive.setPlaylist(playlist);
  } catch {
    lastSent = '';
  }
}

/** Au retour dans l'app : des images que le natif n'a pas pu préparer (réseau coupé…) sont réessayées. */
async function retryMissing() {
  if (lastSent === OFF || lastSent === '') return;
  try {
    const { playlist } = await PrismeLive.getStatus();
    const sent = JSON.parse(lastSent) as { items: unknown[] };
    if (playlist.count < sent.items.length) {
      lastSent = '';
      schedule();
    }
  } catch {
    // État indisponible : sans conséquence, la liste sera renvoyée au prochain changement.
  }
}

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void push(), 600);
}

/**
 * « Changer à chaque déverrouillage » : renvoie la liste des fonds au natif quand les réglages ou la
 * source changent (favoris ajoutés, copies hors ligne…), de façon groupée. Le natif prépare les images.
 */
export function startPlaylistSync(): () => void {
  const unsubscribers = [
    useLive.subscribe((s, prev) => {
      if (s.unlock !== prev.unlock) schedule();
    }),
    useSettings.subscribe((s, prev) => {
      if (s.features.live !== prev.features.live) schedule();
    }),
    useLibrary.subscribe((s, prev) => {
      if (
        s.items !== prev.items ||
        s.favorites !== prev.favorites ||
        s.collections !== prev.collections ||
        s.offline !== prev.offline ||
        s.hydrated !== prev.hydrated
      )
        schedule();
    }),
  ];
  schedule();
  const resume = isNative ? CapacitorApp.addListener('resume', () => void retryMissing()) : null;
  return () => {
    unsubscribers.forEach((u) => u());
    void resume?.then((h) => h.remove());
    window.clearTimeout(timer);
  };
}
