import { t } from '@/shared/i18n';
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
    <nav className="nav-bar" aria-label={t('Navigation principale')}>
      {TABS.map((item) => {
        const active = item.key === tab;
        return (
          <button
            key={item.key}
            type="button"
            className="nav-bar__item"
            aria-current={active ? 'page' : undefined}
            onClick={() => setTab(item.key)}
          >
            <span className="nav-bar__indicator state">
              <Icon name={active ? item.activeIcon : item.icon} />
            </span>
            {t(item.label)}
          </button>
        );
      })}
    </nav>
  );
}
