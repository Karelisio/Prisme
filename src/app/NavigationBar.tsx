import { Icon } from '@/shared/ui/components';
import type { IconName } from '@/shared/ui/icons';
import { type Tab, useNavigation } from './navigation';

const TABS: { key: Tab; label: string; icon: IconName; activeIcon: IconName }[] = [
  { key: 'explore', label: 'Explorer', icon: 'explore', activeIcon: 'exploreFill' },
  { key: 'library', label: 'Bibliothèque', icon: 'library', activeIcon: 'libraryFill' },
  { key: 'settings', label: 'Réglages', icon: 'settings', activeIcon: 'settingsFill' },
];

export function NavigationBar() {
  const tab = useNavigation((s) => s.tab);
  const setTab = useNavigation((s) => s.setTab);
  return (
    <nav className="nav-bar" aria-label="Navigation principale">
      {TABS.map((t) => {
        const active = t.key === tab;
        return (
          <button
            key={t.key}
            type="button"
            className="nav-bar__item"
            aria-current={active ? 'page' : undefined}
            onClick={() => setTab(t.key)}
          >
            <span className="nav-bar__indicator state">
              <Icon name={active ? t.activeIcon : t.icon} />
            </span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
