import { FollowButton } from '@/features/discover/PhotographerScreen';
import { photographerOf } from '@/features/discover/store';
import { SOURCE_INFO, sourceLabel } from '@/features/sources/registry';
import type { RemoteSource, Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import { Icon, ListItem } from '@/shared/ui/components';
import { BottomSheet } from '@/shared/ui/overlays';

const remote = (w: Wallpaper): RemoteSource | null => (w.source in SOURCE_INFO ? (w.source as RemoteSource) : null);

export function sourceName(w: Wallpaper): string {
  return sourceLabel(w.source);
}

/** « Photo : », « Œuvre : »… devant le nom de l'auteur. */
export function creditPrefix(w: Wallpaper): string {
  if (w.source === 'art') return t('Œuvre :');
  if (w.source === 'nasa') return t('Crédit :');
  return t('Photo :');
}

export function InfoSheet({ wallpaper, open, onClose }: { wallpaper: Wallpaper; open: boolean; onClose: () => void }) {
  const source = remote(wallpaper);
  const license = source ? SOURCE_INFO[source].license : undefined;
  const role = source ? SOURCE_INFO[source].authorRole : 'Auteur';
  const photographer = photographerOf(wallpaper);
  return (
    <BottomSheet open={open} onClose={onClose} title={t('Informations')}>
      <ul className="list">
        {wallpaper.author && (
          <li>
            <a className="list-link" href={wallpaper.author.url} target="_blank" rel="noopener noreferrer">
              <ListItem headline={wallpaper.author.name} supporting={t(role)} leading={<Icon name="image" />} trailing={<Icon name="openInNew" size={20} />} />
            </a>
          </li>
        )}
        {photographer && (
          <li className="info-follow">
            <ListItem headline={t('Ses nouveaux fonds dans Abonnements')} leading={<Icon name="personAdd" />} trailing={<FollowButton photographer={photographer} />} />
          </li>
        )}
        {wallpaper.pageUrl ? (
          <li>
            <a className="list-link" href={wallpaper.pageUrl} target="_blank" rel="noopener noreferrer">
              <ListItem headline={t('Voir sur {source}', { source: sourceName(wallpaper) })} leading={<Icon name="explore" />} trailing={<Icon name="openInNew" size={20} />} />
            </a>
          </li>
        ) : (
          <li>
            <ListItem headline={sourceName(wallpaper)} supporting={t('Source')} leading={<Icon name="explore" />} />
          </li>
        )}
        {wallpaper.width > 0 && wallpaper.height > 0 && (
          <li>
            <ListItem headline={`${wallpaper.width} × ${wallpaper.height} px`} supporting={t("Résolution d'origine")} leading={<Icon name="aspectRatio" />} />
          </li>
        )}
        {license && (
          <li>
            <a className="list-link" href={license.url} target="_blank" rel="noopener noreferrer">
              <ListItem headline={t(license.label)} supporting={t('Utilisation libre et gratuite')} leading={<Icon name="info" />} trailing={<Icon name="openInNew" size={20} />} />
            </a>
          </li>
        )}
      </ul>
    </BottomSheet>
  );
}
