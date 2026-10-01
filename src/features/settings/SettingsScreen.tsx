import { useEffect, useState } from 'react';
import { useNavigation } from '@/app/navigation';
import { queryClient } from '@/app/queryClient';
import { env } from '@/shared/config/env';
import { useCapabilities } from '@/shared/lib/capabilities';
import { formatBytes } from '@/shared/lib/format';
import { PrismeWallpaper, type WallpaperTarget } from '@/shared/native';
import { Button, Chip, Icon, ListItem, SegmentedButtons, Switch } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { type ThemeMode, useSettings } from './store';
import './settings.css';

const THEME_OPTIONS = [
  { value: 'system', label: 'Auto', icon: 'brightnessAuto' },
  { value: 'light', label: 'Clair', icon: 'lightMode' },
  { value: 'dark', label: 'Sombre', icon: 'darkMode' },
] as const satisfies readonly { value: ThemeMode; label: string; icon: string }[];

const SEEDS = ['#6750A4', '#0061A4', '#006A6A', '#386A20', '#7D5700', '#9C4146', '#8B418F', '#5C5F61'];

const TARGET_OPTIONS: { value: WallpaperTarget | 'ask'; label: string }[] = [
  { value: 'ask', label: 'Demander' },
  { value: 'home', label: 'Accueil' },
  { value: 'lock', label: 'Verrouillage' },
  { value: 'both', label: 'Les deux' },
];

export function SettingsScreen() {
  const settings = useSettings();
  const capabilities = useCapabilities();
  const push = useNavigation((s) => s.push);
  const [storage, setStorage] = useState<{ cacheBytes: number; offlineBytes: number } | null>(null);
  const dynamicSupported = capabilities?.dynamicColor ?? false;

  const refreshStorage = () => void PrismeWallpaper.getCacheInfo().then(setStorage, () => undefined);
  useEffect(refreshStorage, []);

  const clearCache = async () => {
    await PrismeWallpaper.clearCache({ includeOffline: false });
    queryClient.clear();
    refreshStorage();
    showSnackbar('Cache vidé');
  };

  return (
    <div className="screen screen--tab settings">
      <header className="top-bar">
        <h1 className="top-bar__title">Réglages</h1>
      </header>

      <section className="settings-section">
        <h2 className="list-subheader">Apparence</h2>
        <div className="settings-block">
          <SegmentedButtons label="Thème" options={THEME_OPTIONS} value={settings.themeMode} onChange={(themeMode) => settings.update({ themeMode })} />
        </div>
        <ListItem
          headline="Couleurs dynamiques"
          supporting={dynamicSupported ? 'Couleurs tirées de ton fond d’écran (Material You)' : 'Nécessite Android 12 ou plus'}
          leading={<Icon name="palette" />}
          trailing={
            <Switch
              label="Couleurs dynamiques"
              checked={settings.dynamicColor && dynamicSupported}
              disabled={!dynamicSupported}
              onChange={(dynamicColor) => settings.update({ dynamicColor })}
            />
          }
        />
        {(!settings.dynamicColor || !dynamicSupported) && (
          <div className="settings-block">
            <p className="settings-label">Couleur d'accent</p>
            <div className="seed-row" role="radiogroup" aria-label="Couleur d'accent">
              {SEEDS.map((seed) => (
                <button
                  key={seed}
                  type="button"
                  role="radio"
                  aria-checked={settings.seedColor === seed}
                  aria-label={seed}
                  className="seed"
                  style={{ background: seed }}
                  onClick={() => settings.update({ seedColor: seed })}
                >
                  {settings.seedColor === seed && <Icon name="check" size={20} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2 className="list-subheader">Galerie</h2>
        <div className="settings-block">
          <p className="settings-label">Colonnes</p>
          <SegmentedButtons
            label="Colonnes"
            options={[
              { value: '2', label: '2 colonnes' },
              { value: '3', label: '3 colonnes' },
            ]}
            value={String(settings.gridColumns) as '2' | '3'}
            onChange={(v) => settings.update({ gridColumns: v === '3' ? 3 : 2 })}
          />
        </div>
        <ListItem
          headline="Économie de données"
          supporting="Miniatures encore plus légères"
          leading={<Icon name="eco" />}
          trailing={<Switch label="Économie de données" checked={settings.dataSaver} onChange={(dataSaver) => settings.update({ dataSaver })} />}
        />
        <ListItem
          headline="Unsplash"
          supporting={env.unsplashKey ? 'Source active, thème Wallpapers en priorité' : 'Clé API absente de ce build'}
          leading={<Icon name="image" />}
          trailing={
            <Switch
              label="Unsplash"
              checked={settings.sources.unsplash}
              onChange={(unsplash) => settings.update({ sources: { ...settings.sources, unsplash } })}
            />
          }
        />
        <ListItem
          headline="Pexels"
          supporting={env.pexelsKey ? 'Source active' : 'Clé API absente de ce build'}
          leading={<Icon name="image" />}
          trailing={
            <Switch label="Pexels" checked={settings.sources.pexels} onChange={(pexels) => settings.update({ sources: { ...settings.sources, pexels } })} />
          }
        />
      </section>

      <section className="settings-section">
        <h2 className="list-subheader">Application du fond</h2>
        <div className="settings-block">
          <p className="settings-label">Écran visé par « Appliquer »</p>
          <div className="chip-wrap">
            {TARGET_OPTIONS.map((o) => (
              <Chip key={o.value} selected={settings.defaultTarget === o.value} onClick={() => settings.update({ defaultTarget: o.value })}>
                {o.label}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="list-subheader">Hors ligne</h2>
        <ListItem
          headline="Favoris en pleine résolution"
          supporting="Pour les appliquer sans connexion"
          leading={<Icon name="download" />}
          trailing={
            <Switch label="Favoris en pleine résolution" checked={settings.offlineFavorites} onChange={(offlineFavorites) => settings.update({ offlineFavorites })} />
          }
        />
        <ListItem
          headline="Stockage"
          supporting={storage ? `Cache ${formatBytes(storage.cacheBytes)} · hors ligne ${formatBytes(storage.offlineBytes)}` : '…'}
          leading={<Icon name="folderOpen" />}
          trailing={
            <Button variant="text" onClick={() => void clearCache()}>
              Vider
            </Button>
          }
        />
      </section>

      <section className="settings-section">
        <h2 className="list-subheader">À propos</h2>
        <ListItem headline="Prisme" supporting={`Version ${__APP_VERSION__}`} leading={<Icon name="wallpaper" />} />
        <ListItem
          headline="Photos"
          supporting="Fournies par Unsplash et Pexels, sous leurs licences respectives"
          leading={<Icon name="info" />}
        />
        <ListItem headline="Diagnostic" supporting="Tester le plugin natif" leading={<Icon name="bugReport" />} onClick={() => push({ type: 'diagnostics' })} />
      </section>
    </div>
  );
}
