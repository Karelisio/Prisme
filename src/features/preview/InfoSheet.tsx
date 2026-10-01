import type { Wallpaper } from '@/features/sources/types';
import { Icon, ListItem } from '@/shared/ui/components';
import { BottomSheet } from '@/shared/ui/overlays';

const SOURCE_NAMES: Record<Wallpaper['source'], string> = {
  unsplash: 'Unsplash',
  pexels: 'Pexels',
  pack: 'Pack Prisme',
  device: 'Galerie du téléphone',
  creation: 'Création Prisme',
};

const LICENSES: Partial<Record<Wallpaper['source'], { label: string; url: string }>> = {
  unsplash: { label: 'Licence Unsplash', url: 'https://unsplash.com/license' },
  pexels: { label: 'Licence Pexels', url: 'https://www.pexels.com/license/' },
};

export function sourceName(w: Wallpaper): string {
  return SOURCE_NAMES[w.source];
}

export function InfoSheet({ wallpaper, open, onClose }: { wallpaper: Wallpaper; open: boolean; onClose: () => void }) {
  const license = LICENSES[wallpaper.source];
  return (
    <BottomSheet open={open} onClose={onClose} title="Informations">
      <ul className="list">
        {wallpaper.author && (
          <li>
            <a className="list-link" href={wallpaper.author.url} target="_blank" rel="noopener noreferrer">
              <ListItem headline={wallpaper.author.name} supporting="Photographe" leading={<Icon name="image" />} trailing={<Icon name="openInNew" size={20} />} />
            </a>
          </li>
        )}
        {wallpaper.pageUrl ? (
          <li>
            <a className="list-link" href={wallpaper.pageUrl} target="_blank" rel="noopener noreferrer">
              <ListItem headline={`Voir sur ${sourceName(wallpaper)}`} leading={<Icon name="explore" />} trailing={<Icon name="openInNew" size={20} />} />
            </a>
          </li>
        ) : (
          <li>
            <ListItem headline={sourceName(wallpaper)} supporting="Source" leading={<Icon name="explore" />} />
          </li>
        )}
        <li>
          <ListItem headline={`${wallpaper.width} × ${wallpaper.height} px`} supporting="Résolution d'origine" leading={<Icon name="aspectRatio" />} />
        </li>
        {license && (
          <li>
            <a className="list-link" href={license.url} target="_blank" rel="noopener noreferrer">
              <ListItem headline={license.label} supporting="Utilisation libre et gratuite" leading={<Icon name="info" />} trailing={<Icon name="openInNew" size={20} />} />
            </a>
          </li>
        )}
      </ul>
    </BottomSheet>
  );
}
