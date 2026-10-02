import { openPreview } from '@/app/navigation';
import { importFromGallery } from '@/features/sources/device';
import { t } from '@/shared/i18n';
import { nativeErrorMessage } from '@/shared/native';
import { showSnackbar } from '@/shared/ui/overlays';

export async function importAndPreview() {
  try {
    const wallpaper = await importFromGallery();
    if (wallpaper) openPreview(wallpaper);
  } catch (error) {
    showSnackbar(t('Import impossible : {error}', { error: nativeErrorMessage(error) }));
  }
}
