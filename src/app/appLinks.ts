import { openReceived } from '@/features/library/receive';
import { PrismeLibrary } from '@/shared/native/library';

/**
 * Liens « prisme://collection/<code> » (messagerie, navigateur) : l'app s'ouvre sur l'aperçu de la
 * collection reçue, qu'elle soit déjà ouverte ou lancée par le lien (Android garde l'événement
 * jusqu'à ce que cet écouteur existe).
 */
export function startCollectionLinks(): () => void {
  const handle = PrismeLibrary.addListener('collectionLink', (e) => void openReceived(e.url));
  return () => void handle.then((h) => h.remove());
}
