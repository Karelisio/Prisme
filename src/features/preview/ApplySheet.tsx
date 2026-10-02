import { useSettings } from '@/features/settings/store';
import { t } from '@/shared/i18n';
import { useCapabilities } from '@/shared/lib/capabilities';
import type { WallpaperTarget } from '@/shared/native';
import { Icon, ListItem } from '@/shared/ui/components';
import type { IconName } from '@/shared/ui/icons';
import { BottomSheet } from '@/shared/ui/overlays';
import { type ApplyChoice, TARGET_LABELS } from './applyWallpaper';

export type { ApplyChoice };

const OPTIONS: { target: WallpaperTarget; icon: IconName }[] = [
  { target: 'home', icon: 'home' },
  { target: 'lock', icon: 'lock' },
  { target: 'both', icon: 'mobile' },
];

export function ApplySheet({
  open,
  onClose,
  onApply,
  allowLinked = false,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (choice: ApplyChoice) => void;
  /** Propose les fonds assortis (depuis l'aperçu d'une image seulement). */
  allowLinked?: boolean;
}) {
  const features = useSettings((s) => s.features);
  const capabilities = useCapabilities();
  const liveAvailable = features.live && capabilities?.liveWallpaper !== false;
  return (
    <BottomSheet open={open} onClose={onClose} title={t('Appliquer sur')}>
      <ul className="list">
        {OPTIONS.map(({ target, icon }) => (
          <li key={target}>
            <ListItem headline={TARGET_LABELS[target]} leading={<Icon name={icon} />} onClick={() => onApply(target)} />
          </li>
        ))}
        {allowLinked && features.linked && (
          <li>
            <ListItem
              headline={t('Accueil et verrouillage assortis')}
              supporting={t("Une variante floue, sombre ou en gros plan pour l'autre écran")}
              leading={<Icon name="link" />}
              onClick={() => onApply('linked')}
            />
          </li>
        )}
        {liveAvailable && (
          <li>
            <ListItem
              headline={t('Fond animé (parallaxe)')}
              supporting={t('Suit les mouvements du téléphone')}
              leading={<Icon name="rotation3d" />}
              onClick={() => onApply('live')}
            />
          </li>
        )}
      </ul>
    </BottomSheet>
  );
}
