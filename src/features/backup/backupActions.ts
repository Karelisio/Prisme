import { useAutomationPrefs } from '@/features/automation/store';
import { useDiscover } from '@/features/discover/store';
import { useLibrary } from '@/features/library/store';
import { useSettings } from '@/features/settings/store';
import { PrismeSystem } from '@/shared/native/system';
import { BackupError, backupFileName, createBackup, mergeDiscover, mergeLibrary, parseBackup } from './backup';

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Enregistre la sauvegarde là où l'utilisateur le choisit ; null s'il annule. */
export async function exportBackup(): Promise<string | null> {
  const library = useLibrary.getState();
  if (!library.hydrated) throw new BackupError('Bibliothèque en cours de chargement, réessaie dans un instant');
  const backup = createBackup(library, useSettings.getState(), useAutomationPrefs.getState(), new Date(), __APP_VERSION__, useDiscover.getState());
  const { saved } = await PrismeSystem.exportFile({
    fileName: backupFileName(backup.exportedAt),
    mimeType: 'application/json',
    data: JSON.stringify(backup, null, 2),
  });
  if (!saved) return null;
  const { favorites, collections } = backup.library;
  return `Sauvegarde enregistrée : ${plural(Object.keys(favorites).length, 'favori')}, ${plural(collections.length, 'collection')}`;
}

/** Restaure un fichier choisi par l'utilisateur (fusion avec la bibliothèque) ; null s'il annule. */
export async function importBackup(): Promise<string | null> {
  const library = useLibrary.getState();
  if (!library.hydrated) throw new BackupError('Bibliothèque en cours de chargement, réessaie dans un instant');
  const result = await PrismeSystem.importFile();
  if (result.cancelled) return null;
  const backup = parseBackup(result.data);
  const merged = mergeLibrary(useLibrary.getState(), backup.library);
  useLibrary.setState({
    items: merged.items,
    favorites: merged.favorites,
    collections: merged.collections,
    history: merged.history,
    tags: merged.tags,
    sort: merged.sort,
  });
  useSettings.getState().update(backup.settings);
  useAutomationPrefs.setState((current) => ({
    ...current,
    ...backup.automation,
    rotation: { ...current.rotation, ...backup.automation.rotation },
    dynamic: { ...current.dynamic, ...backup.automation.dynamic },
    focus: { ...current.focus, ...backup.automation.focus },
  }));
  if (backup.discover) useDiscover.setState(mergeDiscover(useDiscover.getState(), backup.discover));
  const { favorites, collections } = backup.library;
  return `Sauvegarde restaurée : ${plural(Object.keys(favorites).length, 'favori')}, ${plural(collections.length, 'collection')}`;
}
