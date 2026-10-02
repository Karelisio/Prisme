import { useEffect, useState } from 'react';
import {
  type Capabilities,
  type ScreenInfo,
  type SystemTheme,
  type WallpaperTarget,
  PrismeWallpaper,
  isNative,
  nativeErrorMessage,
  toWebUrl,
} from '@/shared/native';
import { goBack } from '@/app/navigation';
import { locale, t } from '@/shared/i18n';
import { formatBytes } from '@/shared/lib/format';
import { type AutomationStatus, PrismeAutomation } from '@/shared/native/automation';
import { type ErrorEntry, PrismeSystem } from '@/shared/native/system';
import { Button, IconButton } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { clearErrorLog, formatErrorLog, loadErrorLog } from './errorLog';
import { renderTestWallpaper } from './testWallpaper';

const TARGET_LABELS: Record<WallpaperTarget, string> = {
  home: 'Accueil',
  lock: 'Verrouillage',
  both: 'Les deux',
};

const targetLabel = (target: WallpaperTarget) => t(TARGET_LABELS[target]);

/** Erreurs gardées par l'app (interface et natif), à partager pour signaler un bug. */
function ErrorLogSection({ capabilities }: { capabilities?: Capabilities }) {
  const [entries, setEntries] = useState<ErrorEntry[] | null>(null);
  const reload = () => void loadErrorLog().then(setEntries);
  useEffect(reload, []);

  const share = async () => {
    const device = capabilities ? ` · ${capabilities.manufacturer} ${capabilities.model} (SDK ${capabilities.sdkInt})` : '';
    try {
      await PrismeSystem.shareText({ text: formatErrorLog(entries ?? [], `version ${__APP_VERSION__}${device}`), title: t('Journal d’erreurs Prisme') });
    } catch (error) {
      showSnackbar(t('Échec : {error}', { error: nativeErrorMessage(error) }));
    }
  };

  const clear = async () => {
    await clearErrorLog();
    reload();
    showSnackbar(t('Journal effacé'));
  };

  return (
    <section aria-labelledby="errors-title">
      <h2 id="errors-title">{t('Journal d’erreurs')}</h2>
      {entries && entries.length === 0 && <p className="diagnostics__empty">{t('Aucune erreur enregistrée.')}</p>}
      {entries && entries.length > 0 && (
        <ol className="diagnostics__errors">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <details>
                <summary>
                  <span className="diagnostics__error-meta">
                    {new Date(e.at).toLocaleString(locale())} · {e.source === 'native' ? t('Natif') : t('Interface')} · {t(e.where)}
                  </span>
                  <span>{e.message}</span>
                </summary>
                {e.stack && <pre>{e.stack}</pre>}
              </details>
            </li>
          ))}
        </ol>
      )}
      <div className="diagnostics__actions">
        <Button variant="tonal" icon="share" disabled={!entries?.length} onClick={() => void share()}>
          {t('Partager')}
        </Button>
        <Button variant="outlined" icon="delete" disabled={!entries?.length} onClick={() => void clear()}>
          {t('Effacer')}
        </Button>
      </div>
    </section>
  );
}

/** Écran technique : vérifie le pont natif (capacités, écran, couleurs système, application d'un fond). */
export function DiagnosticsScreen() {
  const [capabilities, setCapabilities] = useState<Capabilities>();
  const [screen, setScreen] = useState<ScreenInfo>();
  const [theme, setTheme] = useState<SystemTheme>();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastImage, setLastImage] = useState<string>();
  const [automation, setAutomation] = useState<AutomationStatus>();

  const append = (line: string) => setLog((lines) => [`${new Date().toLocaleTimeString(locale())} · ${line}`, ...lines].slice(0, 30));

  useEffect(() => {
    void PrismeWallpaper.getCapabilities().then(setCapabilities);
    void PrismeWallpaper.getScreenInfo().then(setScreen);
    void PrismeWallpaper.getSystemTheme().then(setTheme);
    void PrismeAutomation.getStatus().then(setAutomation, () => undefined);
    const handles = [
      PrismeWallpaper.addListener('systemThemeChanged', (next) => {
        setTheme(next);
        append(t('Thème système mis à jour ({mode})', { mode: next.isDark ? t('sombre') : t('clair') }));
      }),
      PrismeWallpaper.addListener('applyProgress', (e) => append(t('Téléchargement {percent} %', { percent: Math.round(e.progress * 100) }))),
    ];
    return () => {
      for (const handle of handles) void handle.then((h) => h.remove());
    };
  }, []);

  async function run(label: string, task: () => Promise<string>) {
    setBusy(true);
    try {
      append(`${label}…`);
      append(await task());
    } catch (error) {
      append(t('Échec : {error}', { error: nativeErrorMessage(error) }));
    } finally {
      setBusy(false);
    }
  }

  const applyTest = (target: WallpaperTarget) =>
    run(t('Fond test → {screen}', { screen: targetLabel(target) }), async () => {
      const size = screen ?? (await PrismeWallpaper.getScreenInfo());
      const data = renderTestWallpaper(size.width, size.height, targetLabel(target));
      const saved = await PrismeWallpaper.saveImage({ data, name: `test-${target}` });
      setLastImage(toWebUrl(saved.path));
      const result = await PrismeWallpaper.setWallpaper({ uri: saved.path, target, id: `test-${target}` });
      return t('Appliqué ({screen}, {width}×{height})', { screen: targetLabel(result.target), width: result.width, height: result.height });
    });

  const applyFromGallery = () =>
    run(t('Import galerie'), async () => {
      const picked = await PrismeWallpaper.pickImage();
      if (picked.cancelled) return t('Import annulé');
      setLastImage(toWebUrl(picked.path));
      await PrismeWallpaper.setWallpaper({ uri: picked.path, target: 'both' });
      return t('Image {width}×{height} appliquée sur les deux écrans', { width: picked.width, height: picked.height });
    });

  const showCache = () =>
    run(t('Cache'), async () => {
      const info = await PrismeWallpaper.getCacheInfo();
      return t('Cache {cache} · hors ligne {offline}', { cache: formatBytes(info.cacheBytes), offline: formatBytes(info.offlineBytes) });
    });

  return (
    <div className="screen overlay-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label={t('Retour')} onClick={goBack} />
        <h1 className="top-bar__title">{t('Diagnostic')}</h1>
      </header>
      <main className="diagnostics">
      <section>
        <h2>{t('Appareil')}</h2>
        <dl>
          <dt>{t('Plateforme')}</dt>
          <dd>{isNative ? 'Android' : t('Navigateur (simulation)')}</dd>
          {capabilities && (
            <>
              <dt>{t('Modèle')}</dt>
              <dd>
                {capabilities.manufacturer} {capabilities.model} · SDK {capabilities.sdkInt}
              </dd>
              <dt>{t('Fond modifiable')}</dt>
              <dd>{capabilities.supported && capabilities.settable ? t('Oui') : t('Non')}</dd>
              <dt>{t('Fond animé')}</dt>
              <dd>{capabilities.liveWallpaper ? t('Disponible') : t('Indisponible')}</dd>
              <dt>{t('Couleurs dynamiques')}</dt>
              <dd>{capabilities.dynamicColor ? t('Oui (Android 12+)') : t('Non')}</dd>
            </>
          )}
          {screen && (
            <>
              <dt>{t('Écran')}</dt>
              <dd>{t('{width} × {height} px · densité {density}', { width: screen.width, height: screen.height, density: screen.density })}</dd>
            </>
          )}
          {theme && (
            <>
              <dt>{t('Thème système')}</dt>
              <dd>{theme.isDark ? t('Sombre') : t('Clair')}</dd>
            </>
          )}
        </dl>
        {theme?.palettes && (
          <div className="diagnostics__palettes" aria-label={t('Palettes Material You')}>
            {Object.entries(theme.palettes).map(([name, tones]) => (
              <div key={name} className="diagnostics__palette">
                {Object.entries(tones).map(([tone, color]) => (
                  <span key={tone} title={`${name} ${tone}`} style={{ background: color }} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>{t('Appliquer un fond test')}</h2>
        <div className="diagnostics__actions">
          {(Object.keys(TARGET_LABELS) as WallpaperTarget[]).map((target) => (
            <Button key={target} variant="tonal" disabled={busy} onClick={() => void applyTest(target)}>
              {targetLabel(target)}
            </Button>
          ))}
          <Button variant="outlined" disabled={busy} onClick={() => void applyFromGallery()}>
            {t('Depuis la galerie')}
          </Button>
          <Button variant="outlined" disabled={busy} onClick={() => void showCache()}>
            {t('Taille du cache')}
          </Button>
        </div>
        {lastImage && <img className="diagnostics__preview" src={lastImage} alt={t('Dernière image appliquée')} />}
      </section>

      {automation && (
        <section>
          <h2>{t('Automatismes')}</h2>
          <dl>
            <dt>{t('Actifs')}</dt>
            <dd>{automation.enabled ? t('Oui') : t('Non')}</dd>
            <dt>{t('Dernière vérification')}</dt>
            <dd>{automation.lastRunAt ? new Date(automation.lastRunAt).toLocaleString(locale()) : t('Jamais')}</dd>
            <dt>{t('Fonds pour « Fond suivant »')}</dt>
            <dd>{automation.quickPoolSize ?? 0}</dd>
          </dl>
        </section>
      )}

      <ErrorLogSection capabilities={capabilities} />

      <section>
        <h2>{t('Journal des tests')}</h2>
        <ol className="diagnostics__log" aria-live="polite">
          {log.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ol>
      </section>
      </main>
    </div>
  );
}
