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
import { formatBytes } from '@/shared/lib/format';
import { Button, IconButton } from '@/shared/ui/components';
import { renderTestWallpaper } from './testWallpaper';

const TARGET_LABELS: Record<WallpaperTarget, string> = {
  home: 'Accueil',
  lock: 'Verrouillage',
  both: 'Les deux',
};

/** Écran technique : vérifie le pont natif (capacités, écran, couleurs système, application d'un fond). */
export function DiagnosticsScreen() {
  const [capabilities, setCapabilities] = useState<Capabilities>();
  const [screen, setScreen] = useState<ScreenInfo>();
  const [theme, setTheme] = useState<SystemTheme>();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastImage, setLastImage] = useState<string>();

  const append = (line: string) => setLog((lines) => [`${new Date().toLocaleTimeString('fr-FR')} · ${line}`, ...lines].slice(0, 30));

  useEffect(() => {
    void PrismeWallpaper.getCapabilities().then(setCapabilities);
    void PrismeWallpaper.getScreenInfo().then(setScreen);
    void PrismeWallpaper.getSystemTheme().then(setTheme);
    const handles = [
      PrismeWallpaper.addListener('systemThemeChanged', (t) => {
        setTheme(t);
        append(`Thème système mis à jour (${t.isDark ? 'sombre' : 'clair'})`);
      }),
      PrismeWallpaper.addListener('applyProgress', (e) => append(`Téléchargement ${Math.round(e.progress * 100)} %`)),
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
      append(`Échec : ${nativeErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  const applyTest = (target: WallpaperTarget) =>
    run(`Fond test → ${TARGET_LABELS[target]}`, async () => {
      const size = screen ?? (await PrismeWallpaper.getScreenInfo());
      const data = renderTestWallpaper(size.width, size.height, TARGET_LABELS[target]);
      const saved = await PrismeWallpaper.saveImage({ data, name: `test-${target}` });
      setLastImage(toWebUrl(saved.path));
      const result = await PrismeWallpaper.setWallpaper({ uri: saved.path, target, id: `test-${target}` });
      return `Appliqué (${TARGET_LABELS[result.target]}, ${result.width}×${result.height})`;
    });

  const applyFromGallery = () =>
    run('Import galerie', async () => {
      const picked = await PrismeWallpaper.pickImage();
      if (picked.cancelled) return 'Import annulé';
      setLastImage(toWebUrl(picked.path));
      await PrismeWallpaper.setWallpaper({ uri: picked.path, target: 'both' });
      return `Image ${picked.width}×${picked.height} appliquée sur les deux écrans`;
    });

  const showCache = () =>
    run('Cache', async () => {
      const info = await PrismeWallpaper.getCacheInfo();
      return `Cache ${formatBytes(info.cacheBytes)} · hors ligne ${formatBytes(info.offlineBytes)}`;
    });

  return (
    <div className="screen overlay-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">Diagnostic</h1>
      </header>
      <main className="diagnostics">
      <section>
        <h2>Appareil</h2>
        <dl>
          <dt>Plateforme</dt>
          <dd>{isNative ? 'Android' : 'Navigateur (simulation)'}</dd>
          {capabilities && (
            <>
              <dt>Modèle</dt>
              <dd>
                {capabilities.manufacturer} {capabilities.model} · SDK {capabilities.sdkInt}
              </dd>
              <dt>Fond modifiable</dt>
              <dd>{capabilities.supported && capabilities.settable ? 'Oui' : 'Non'}</dd>
              <dt>Fond animé</dt>
              <dd>{capabilities.liveWallpaper ? 'Disponible' : 'Indisponible'}</dd>
              <dt>Couleurs dynamiques</dt>
              <dd>{capabilities.dynamicColor ? 'Oui (Android 12+)' : 'Non'}</dd>
            </>
          )}
          {screen && (
            <>
              <dt>Écran</dt>
              <dd>
                {screen.width} × {screen.height} px · densité {screen.density}
              </dd>
            </>
          )}
          {theme && (
            <>
              <dt>Thème système</dt>
              <dd>{theme.isDark ? 'Sombre' : 'Clair'}</dd>
            </>
          )}
        </dl>
        {theme?.palettes && (
          <div className="diagnostics__palettes" aria-label="Palettes Material You">
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
        <h2>Appliquer un fond test</h2>
        <div className="diagnostics__actions">
          {(Object.keys(TARGET_LABELS) as WallpaperTarget[]).map((target) => (
            <Button key={target} variant="tonal" disabled={busy} onClick={() => void applyTest(target)}>
              {TARGET_LABELS[target]}
            </Button>
          ))}
          <Button variant="outlined" disabled={busy} onClick={() => void applyFromGallery()}>
            Depuis la galerie
          </Button>
          <Button variant="outlined" disabled={busy} onClick={() => void showCache()}>
            Taille du cache
          </Button>
        </div>
        {lastImage && <img className="diagnostics__preview" src={lastImage} alt="Dernière image appliquée" />}
      </section>

      <section>
        <h2>Journal</h2>
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
