import { useEffect, useState } from 'react';
import { useNavigation } from '@/app/navigation';
import { queryClient } from '@/app/queryClient';
import { FAVORITES_SOURCE, INTERVALS } from '@/features/automation/model';
import { DEFAULT_ONLINE, ONLINE_SOURCE, onlineThemeLabel } from '@/features/automation/online';
import { useAutomationPrefs } from '@/features/automation/store';
import { exportBackup, importBackup } from '@/features/backup/backupActions';
import { setDailyNotification } from '@/features/discover/dailySync';
import { hiddenCount, useDiscover } from '@/features/discover/store';
import { useLibrary } from '@/features/library/store';
import { UpdateSettings } from '@/features/updates/UpdateSettings';
import { useCapabilities } from '@/shared/lib/capabilities';
import { formatBytes } from '@/shared/lib/format';
import { PrismeWallpaper, type WallpaperTarget, nativeErrorMessage } from '@/shared/native';
import { PrismeSystem } from '@/shared/native/system';
import { type LanguagePref, t, tn } from '@/shared/i18n';
import { Button, Chip, Icon, ListItem, Switch } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { useOnboarding } from '@/features/onboarding/store';
import { AdvancedOptions } from './AdvancedOptions';
import { GridPicker, ThemePicker } from './pickers';
import { SourceToggles } from './SourceToggles';
import { useSettings } from './store';
import './settings.css';

/** Langues de l'interface : celle du téléphone, ou imposée (nom de la langue dans la langue elle-même). */
const LANGUAGES: readonly { value: LanguagePref; label: string }[] = [
  { value: 'system', label: 'Langue du téléphone' },
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

/** Couleurs d'accent proposées (quand les couleurs dynamiques du système ne s'appliquent pas). */
const SEEDS = [
  { value: '#6750A4', name: 'Violet' },
  { value: '#0061A4', name: 'Bleu' },
  { value: '#006A6A', name: 'Turquoise' },
  { value: '#386A20', name: 'Vert' },
  { value: '#7D5700', name: 'Ambre' },
  { value: '#9C4146', name: 'Rouge' },
  { value: '#8B418F', name: 'Magenta' },
  { value: '#5C5F61', name: 'Gris' },
];

const DAILY_HOURS = [7, 8, 9, 12, 18, 21];

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
  const rotation = useAutomationPrefs((s) => s.rotation);
  const collections = useLibrary((s) => s.collections);
  const rotationSource =
    rotation.source === ONLINE_SOURCE
      ? t('en ligne, {theme}', { theme: t(onlineThemeLabel({ ...DEFAULT_ONLINE, ...rotation.online })) })
      : rotation.source === FAVORITES_SOURCE
        ? t('favoris')
        : t('collection « {name} »', { name: collections.find((c) => c.id === rotation.source)?.name ?? '?' });
  const rotationInterval = t(INTERVALS.find((i) => i.minutes === rotation.intervalMinutes)?.label ?? `${rotation.intervalMinutes} min`);
  const [storage, setStorage] = useState<{ cacheBytes: number; offlineBytes: number } | null>(null);
  const dynamicSupported = capabilities?.dynamicColor ?? false;
  const hidden = useDiscover(hiddenCount);

  const refreshStorage = () => void PrismeWallpaper.getCacheInfo().then(setStorage, () => undefined);
  useEffect(refreshStorage, []);

  /** Action qui renvoie un message (ou null si l'utilisateur a annulé). */
  const report = async (action: () => Promise<string | null>) => {
    try {
      const message = await action();
      if (message) showSnackbar(message);
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    }
  };

  const addTile = () =>
    report(async () => {
      const { result } = await PrismeSystem.requestAddTile();
      if (result === 'added') return t('Tuile ajoutée aux Réglages rapides');
      if (result === 'already') return t('La tuile est déjà dans les Réglages rapides');
      if (result === 'declined') return null;
      return t('Ouvre les Réglages rapides, touche le crayon puis fais glisser « Fond suivant »');
    });

  const addWidget = () =>
    report(async () => {
      const { result } = await PrismeSystem.requestPinWidget();
      // Le lanceur affiche lui-même sa confirmation ; sinon, on indique où trouver le widget.
      return result === 'requested' ? null : t("Appui long sur l'écran d'accueil › Widgets › Prisme");
    });

  const clearCache = async () => {
    await PrismeWallpaper.clearCache({ includeOffline: false });
    queryClient.clear();
    refreshStorage();
    showSnackbar(t('Cache vidé'));
  };

  return (
    <div className="screen screen--tab settings">
      <header className="top-bar">
        <h1 className="top-bar__title">{t('Réglages')}</h1>
      </header>

      <section className="settings-section">
        <h2 className="list-subheader">{t('Apparence')}</h2>
        <div className="settings-block">
          <ThemePicker value={settings.themeMode} onChange={(themeMode) => settings.update({ themeMode })} />
          {settings.themeMode === 'black' && <p className="settings-hint">{t('Fonds noirs purs : plus de contraste, et moins de batterie sur un écran OLED.')}</p>}
        </div>
        <div className="settings-block">
          <div className="chip-wrap" role="group" aria-label={t('Langue')}>
            {LANGUAGES.map((l) => (
              <Chip key={l.value} icon={l.value === 'system' ? 'mobile' : undefined} selected={settings.language === l.value} onClick={() => settings.update({ language: l.value })}>
                {l.value === 'system' ? t(l.label) : l.label}
              </Chip>
            ))}
          </div>
        </div>
        <ListItem
          headline={t('Couleurs dynamiques')}
          supporting={dynamicSupported ? t('Couleurs tirées de ton fond d’écran (Material You)') : t('Nécessite Android 12 ou plus')}
          leading={<Icon name="palette" />}
          trailing={
            <Switch
              label={t('Couleurs dynamiques')}
              checked={settings.dynamicColor && dynamicSupported}
              disabled={!dynamicSupported}
              onChange={(dynamicColor) => settings.update({ dynamicColor })}
            />
          }
        />
        <ListItem
          headline={t('Retours haptiques')}
          supporting={t('Légère vibration quand un fond est appliqué, enregistré…')}
          leading={<Icon name="vibration" />}
          trailing={<Switch label={t('Retours haptiques')} checked={settings.haptics} onChange={(haptics) => settings.update({ haptics })} />}
        />
        {(!settings.dynamicColor || !dynamicSupported) && (
          <div className="settings-block">
            <p className="settings-label">{t("Couleur d'accent")}</p>
            <div className="seed-row" role="radiogroup" aria-label={t("Couleur d'accent")}>
              {SEEDS.map(({ value, name }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={settings.seedColor === value}
                  aria-label={`${t(name)} ${value}`}
                  title={t(name)}
                  className="seed"
                  style={{ background: value }}
                  onClick={() => settings.update({ seedColor: value })}
                >
                  {settings.seedColor === value && <Icon name="check" size={20} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2 className="list-subheader">{t('Galerie')}</h2>
        <div className="settings-block">
          <p className="settings-label">{t('Disposition de la grille')}</p>
          <GridPicker value={settings.gridLayout} onChange={(gridLayout) => settings.update({ gridLayout })} />
          {settings.gridLayout === 'mosaic' && <p className="settings-hint">{t('Chaque fond garde son format, et les colonnes restent équilibrées.')}</p>}
        </div>
        <ListItem
          headline={t('Économie de données')}
          supporting={t('Miniatures encore plus légères')}
          leading={<Icon name="eco" />}
          trailing={<Switch label={t('Économie de données')} checked={settings.dataSaver} onChange={(dataSaver) => settings.update({ dataSaver })} />}
        />
        <ListItem
          headline={t('HD seulement en Wi-Fi')}
          supporting={t('Sur données mobiles, images à la taille de l’écran')}
          leading={<Icon name="wifi" />}
          trailing={
            <Switch label={t('HD seulement en Wi-Fi')} checked={settings.hdOnWifiOnly} onChange={(hdOnWifiOnly) => settings.update({ hdOnWifiOnly })} />
          }
        />
      </section>

      <section className="settings-section">
        <h2 className="list-subheader">{t('Sources')}</h2>
        <SourceToggles />
      </section>

      <section className="settings-section">
        <h2 className="list-subheader">{t('Découverte')}</h2>
        <ListItem
          headline={t('Notification « Fond du jour »')}
          supporting={
            settings.dailyNotification ? t('Chaque jour à {hour} h', { hour: settings.dailyHour }) : t('Une sélection chaque matin, en tête d’« À la une »')
          }
          leading={<Icon name="notifications" />}
          trailing={
            <Switch
              label={t('Notification « Fond du jour »')}
              checked={settings.dailyNotification}
              onChange={(on) => void report(() => setDailyNotification(on))}
            />
          }
        />
        {settings.dailyNotification && (
          <div className="settings-block">
            <p className="settings-label">{t('Heure de la notification')}</p>
            <div className="chip-wrap">
              {DAILY_HOURS.map((hour) => (
                <Chip key={hour} selected={settings.dailyHour === hour} onClick={() => void report(() => setDailyNotification(true, hour))}>
                  {t('{hour} h', { hour })}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <ListItem
          headline={t('Contenus masqués')}
          supporting={
            hidden > 0
              ? tn(hidden, '{count} élément : fonds, auteurs, sujets', '{count} éléments : fonds, auteurs, sujets')
              : t('Fonds, auteurs et sujets que tu ne veux plus voir')
          }
          leading={<Icon name="visibilityOff" />}
          onClick={() => push({ type: 'hidden' })}
        />
      </section>

      <section className="settings-section">
        <h2 className="list-subheader">{t('Application du fond')}</h2>
        <div className="settings-block">
          <p className="settings-label">{t('Écran visé par « Appliquer »')}</p>
          <div className="chip-wrap">
            {TARGET_OPTIONS.map((o) => (
              <Chip key={o.value} selected={settings.defaultTarget === o.value} onClick={() => settings.update({ defaultTarget: o.value })}>
                {t(o.label)}
              </Chip>
            ))}
          </div>
        </div>
        <ListItem
          headline={t('Changement automatique')}
          supporting={
            settings.features.rotation
              ? t('Toutes les {interval} · {source}', { interval: rotationInterval, source: rotationSource })
              : t('Désactivé · de 15 min à 24 h, depuis Internet ou tes favoris, même app fermée')
          }
          leading={<Icon name="autorenew" />}
          onClick={() => push({ type: 'rotation' })}
        />
        <ListItem
          headline={t('Tuile « Fond suivant »')}
          supporting={t('Réglages rapides : fond suivant de la rotation ou favori au hasard ; appui long sur l’icône pour d’autres raccourcis')}
          leading={<Icon name="skipNext" />}
          onClick={() => void addTile()}
        />
        <ListItem
          headline={t("Widget d'accueil")}
          supporting={t("Aperçu du fond actuel et bouton « Fond suivant » à poser sur l'accueil")}
          leading={<Icon name="widgets" />}
          onClick={() => void addWidget()}
        />
      </section>

      <section className="settings-section">
        <h2 className="list-subheader">{t('Sauvegarde')}</h2>
        <ListItem
          headline={t('Exporter une sauvegarde')}
          supporting={t('Favoris, collections, historique et réglages dans un fichier')}
          leading={<Icon name="backup" />}
          onClick={() => void report(exportBackup)}
        />
        <ListItem
          headline={t('Restaurer une sauvegarde')}
          supporting={t('Ajoutée à tes favoris et collections ; images importées et créations non incluses')}
          leading={<Icon name="restore" />}
          onClick={() => void report(importBackup)}
        />
      </section>

      <section className="settings-section">
        <h2 className="list-subheader">{t('Hors ligne')}</h2>
        <ListItem
          headline={t('Favoris en pleine résolution')}
          supporting={t('Pour les appliquer sans connexion')}
          leading={<Icon name="download" />}
          trailing={
            <Switch label={t('Favoris en pleine résolution')} checked={settings.offlineFavorites} onChange={(offlineFavorites) => settings.update({ offlineFavorites })} />
          }
        />
        <ListItem
          headline={t('Stockage')}
          supporting={storage ? t('Cache {cache} · hors ligne {offline}', { cache: formatBytes(storage.cacheBytes), offline: formatBytes(storage.offlineBytes) }) : '…'}
          leading={<Icon name="folderOpen" />}
          trailing={
            <Button variant="text" onClick={() => void clearCache()}>
              {t('Vider')}
            </Button>
          }
        />
      </section>

      <AdvancedOptions />

      <section className="settings-section">
        <h2 className="list-subheader">{t('À propos')}</h2>
        <UpdateSettings />
        <ListItem
          headline={t('Revoir l’introduction')}
          supporting={t('Bienvenue, sources et goûts qui orientent « Pour toi »')}
          leading={<Icon name="explore" />}
          onClick={() => useOnboarding.getState().reopen()}
        />
        <ListItem
          headline={t('Photos')}
          supporting={t('Unsplash, Pexels, Wallhaven, Pixabay, Cleveland Museum of Art et NASA, selon leurs conditions')}
          leading={<Icon name="info" />}
        />
        <ListItem
          headline={t('Diagnostic')}
          supporting={t('Journal d’erreurs, tests du plugin natif')}
          leading={<Icon name="bugReport" />}
          onClick={() => push({ type: 'diagnostics' })}
        />
      </section>
    </div>
  );
}
