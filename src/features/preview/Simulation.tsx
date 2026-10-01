import { useEffect, useState } from 'react';
import type { IconName } from '@/shared/ui/icons';
import { Icon } from '@/shared/ui/components';

export type SimulationMode = 'none' | 'home' | 'lock';

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const HOME_APPS: IconName[] = ['calendar', 'image', 'schedule', 'palette', 'explore', 'history', 'settings', 'search'];
const DOCK_APPS: IconName[] = ['mobile', 'image', 'explore', 'search'];

/** Éléments d'interface factices posés sur l'aperçu pour juger le rendu réel du fond. */
export function Simulation({ mode }: { mode: SimulationMode }) {
  const now = useNow();
  if (mode === 'none') return null;

  if (mode === 'lock') {
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return (
      <div className="sim sim--lock" aria-hidden="true">
        <Icon name="lock" size={20} className="sim-lock__padlock" />
        <div className="sim-lock__clock">
          <span>{hours}</span>
          <span>{minutes}</span>
        </div>
        <div className="sim-lock__date">{now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div className="sim-lock__notification">
          <span className="sim-lock__notification-icon" />
          <span className="sim-lock__notification-lines">
            <span />
            <span />
          </span>
        </div>
        <div className="sim-lock__shortcuts">
          <span className="sim-lock__shortcut">
            <Icon name="bolt" size={22} />
          </span>
          <span className="sim-lock__shortcut">
            <Icon name="image" size={22} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="sim sim--home" aria-hidden="true">
      <div className="sim-home__glance">
        <span className="sim-home__glance-date">{now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        <span className="sim-home__glance-weather">
          <Icon name="sunny" size={18} /> 21 °C
        </span>
      </div>
      <div className="sim-home__apps">
        {HOME_APPS.map((icon, i) => (
          <span key={i} className="sim-home__app">
            <span className="sim-home__icon">
              <Icon name={icon} size={24} />
            </span>
            <span className="sim-home__label" />
          </span>
        ))}
      </div>
      <div className="sim-home__dock">
        {DOCK_APPS.map((icon, i) => (
          <span key={i} className="sim-home__icon">
            <Icon name={icon} size={24} />
          </span>
        ))}
      </div>
      <div className="sim-home__search">
        <Icon name="search" size={20} />
      </div>
    </div>
  );
}
