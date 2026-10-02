import { useNavigation } from '@/app/navigation';
import { t } from '@/shared/i18n';
import { nativeErrorMessage } from '@/shared/native';
import { PrismeLibrary } from '@/shared/native/library';
import { nativeErrorCode } from '@/shared/native/system';
import { showSnackbar } from '@/shared/ui/overlays';
import { type SharedCollection, ShareError, parseSharedInput } from './share';

/** Ouvre l'aperçu d'une collection reçue (une seule fois si le même code arrive deux fois de suite). */
export function showReceived(code: string, collection: SharedCollection): void {
  const nav = useNavigation.getState();
  const top = nav.overlays.at(-1);
  if (top?.type === 'received' && top.code === code) return;
  nav.push({ type: 'received', code, name: collection.name, ids: collection.ids });
}

/**
 * Ouvre l'aperçu d'une collection à partir d'un lien, d'un code ou d'un message de partage collé.
 * Sinon, explique pourquoi dans une bulle et renvoie false.
 */
export async function openReceived(text: string): Promise<boolean> {
  try {
    const { code, collection } = await parseSharedInput(text);
    showReceived(code, collection);
    return true;
  } catch (error) {
    showSnackbar(t(error instanceof ShareError ? error.message : 'Impossible de lire ce code'));
    return false;
  }
}

/** « Scanner un QR » : scanner de Google Play services (sans permission caméra), puis aperçu de la collection lue. */
export async function scanAndOpen(): Promise<void> {
  try {
    const result = await PrismeLibrary.scanQr();
    if (!result.cancelled) await openReceived(result.value);
  } catch (error) {
    // Les messages du plugin sont des phrases complètes ; sans scanner, le code collé reste possible.
    const message = nativeErrorMessage(error).replace(/\.$/, '');
    showSnackbar(nativeErrorCode(error) === 'UNAVAILABLE' ? t('{message}. Utilise « Coller un code » à la place.', { message }) : message);
  }
}
