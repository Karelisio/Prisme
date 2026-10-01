import { useSettings } from '@/features/settings/store';
import { useCapabilities } from '@/shared/lib/capabilities';
import type { WallpaperTarget } from '@/shared/native';
import { Icon, ListItem } from '@/shared/ui/components';
import type { IconName } from '@/shared/ui/icons';
import { BottomSheet } from '@/shared/ui/overlays';
import { TARGET_LABELS } from './applyWallpaper';

const OPTIONS: { target: WallpaperTarget; icon: IconName }[] = [
  { target: 'home', icon: 'home' },
  { target: 'lock', icon: 'lock' },
  { target: 'both', icon: 'mobile' },
];

export type ApplyChoice = WallpaperTarget | 'live';

export function ApplySheet({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (choice: ApplyChoice) => void }) {
  const features = useSettings((s) => s.features);
  const capabilities = useCapabilities();
  const liveAvailable = features.live && capabilities?.liveWallpaper !== false;
  return (
    <BottomSheet open={open} onClose={onClose} title="Appliquer sur">
      <ul className="list">
        {OPTIONS.map(({ target, icon }) => (
          <li key={target}>
            <ListItem headline={TARGET_LABELS[target]} leading={<Icon name={icon} />} onClick={() => onApply(target)} />
          </li>
        ))}
        {liveAvailable && (
          <li>
            <ListItem
              headline="Fond animé (parallaxe)"
              supporting="Suit les mouvements du téléphone"
              leading={<Icon name="rotation3d" />}
              onClick={() => onApply('live')}
            />
          </li>
        )}
      </ul>
    </BottomSheet>
  );
}
