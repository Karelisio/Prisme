import { App as CapacitorApp } from '@capacitor/app';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Suspense, lazy, useEffect, useState } from 'react';
import { ExploreScreen } from '@/features/browse/ExploreScreen';
import { startAutomationSync } from '@/features/automation/sync';
import { startDailySync } from '@/features/discover/dailySync';
import { startOfflineSync } from '@/features/library/offline';
import { startLiveSync } from '@/features/live/liveSync';
import { startPlaylistSync } from '@/features/live/playlistSync';
import { startMusicSync } from '@/features/music/musicSync';
import { startQuoteSync } from '@/features/quote/quoteSync';
import { UpdateSheet } from '@/features/updates/UpdateSheet';
import { startUpdateCheck } from '@/features/updates/useUpdates';
import { startNetworkWatch } from '@/shared/lib/network';
import { isNative } from '@/shared/native';
import { ThemeController } from '@/shared/theme/ThemeController';
import { SnackbarHost } from '@/shared/ui/overlays';
import { startAppActions } from './appActions';
import { handleBack } from './backStack';
import { ErrorBoundary } from './ErrorBoundary';
import { NavigationBar } from './NavigationBar';
import { type OverlayEntry, type Tab, useNavigation } from './navigation';
import { PERSIST_MAX_AGE, queryClient, queryPersister } from './queryClient';

export function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister, maxAge: PERSIST_MAX_AGE, buster: 'v1' }}
    >
      <ThemeController />
      <ErrorBoundary>
        <AppShell />
        <UpdateSheet />
      </ErrorBoundary>
      <SnackbarHost />
    </PersistQueryClientProvider>
  );
}

// Écrans secondaires chargés à la demande : démarrage plus rapide sur les appareils modestes.
const screens = {
  library: () => import('@/features/library/LibraryScreen'),
  settings: () => import('@/features/settings/SettingsScreen'),
  preview: () => import('@/features/preview/PreviewScreen'),
  search: () => import('@/features/browse/SearchScreen'),
  pack: () => import('@/features/packs/PackScreen'),
  collection: () => import('@/features/library/CollectionScreen'),
  diagnostics: () => import('@/features/diagnostics/DiagnosticsScreen'),
  dynamic: () => import('@/features/automation/DynamicScreen'),
  live: () => import('@/features/live/LiveScreen'),
  rotation: () => import('@/features/automation/RotationScreen'),
  music: () => import('@/features/music/MusicScreen'),
  places: () => import('@/features/automation/PlacesScreen'),
  editor: () => import('@/features/editor/EditorScreen'),
  generator: () => import('@/features/generator/GeneratorScreen'),
  focus: () => import('@/features/automation/FocusScreen'),
  similar: () => import('@/features/discover/SimilarScreen'),
  photographer: () => import('@/features/discover/PhotographerScreen'),
  hidden: () => import('@/features/discover/HiddenScreen'),
  events: () => import('@/features/automation/EventsScreen'),
  dim: () => import('@/features/automation/DimScreen'),
  quote: () => import('@/features/quote/QuoteScreen'),
};

const LibraryScreen = lazy(() => screens.library().then((m) => ({ default: m.LibraryScreen })));
const SettingsScreen = lazy(() => screens.settings().then((m) => ({ default: m.SettingsScreen })));
const PreviewScreen = lazy(() => screens.preview().then((m) => ({ default: m.PreviewScreen })));
const SearchScreen = lazy(() => screens.search().then((m) => ({ default: m.SearchScreen })));
const PackScreen = lazy(() => screens.pack().then((m) => ({ default: m.PackScreen })));
const CollectionScreen = lazy(() => screens.collection().then((m) => ({ default: m.CollectionScreen })));
const DiagnosticsScreen = lazy(() => screens.diagnostics().then((m) => ({ default: m.DiagnosticsScreen })));
const DynamicScreen = lazy(() => screens.dynamic().then((m) => ({ default: m.DynamicScreen })));
const LiveScreen = lazy(() => screens.live().then((m) => ({ default: m.LiveScreen })));
const RotationScreen = lazy(() => screens.rotation().then((m) => ({ default: m.RotationScreen })));
const MusicScreen = lazy(() => screens.music().then((m) => ({ default: m.MusicScreen })));
const PlacesScreen = lazy(() => screens.places().then((m) => ({ default: m.PlacesScreen })));
const EditorScreen = lazy(() => screens.editor().then((m) => ({ default: m.EditorScreen })));
const GeneratorScreen = lazy(() => screens.generator().then((m) => ({ default: m.GeneratorScreen })));
const FocusScreen = lazy(() => screens.focus().then((m) => ({ default: m.FocusScreen })));
const SimilarScreen = lazy(() => screens.similar().then((m) => ({ default: m.SimilarScreen })));
const PhotographerScreen = lazy(() => screens.photographer().then((m) => ({ default: m.PhotographerScreen })));
const HiddenScreen = lazy(() => screens.hidden().then((m) => ({ default: m.HiddenScreen })));
const EventsScreen = lazy(() => screens.events().then((m) => ({ default: m.EventsScreen })));
const DimScreen = lazy(() => screens.dim().then((m) => ({ default: m.DimScreen })));
const QuoteScreen = lazy(() => screens.quote().then((m) => ({ default: m.QuoteScreen })));

/** Précharge les écrans secondaires une fois l'app affichée, pendant que le processeur est libre. */
function prefetchScreens() {
  const run = () => Object.values(screens).forEach((load) => void load());
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}

const TAB_SCREENS: Record<Tab, () => React.ReactElement> = {
  explore: () => <ExploreScreen />,
  library: () => <LibraryScreen />,
  settings: () => <SettingsScreen />,
};

function AppShell() {
  const tab = useNavigation((s) => s.tab);
  const overlays = useNavigation((s) => s.overlays);
  // Un onglet n'est monté qu'à sa première visite, puis conservé (position de défilement comprise).
  const [visited, setVisited] = useState<ReadonlySet<Tab>>(() => new Set<Tab>(['explore']));

  useEffect(() => {
    setVisited((v) => (v.has(tab) ? v : new Set([...v, tab])));
  }, [tab]);

  useBackButton();
  useEffect(() => startNetworkWatch(), []);
  useEffect(() => startOfflineSync(), []);
  useEffect(() => startAutomationSync(), []);
  useEffect(() => startMusicSync(), []);
  useEffect(() => startQuoteSync(), []);
  useEffect(() => startLiveSync(), []);
  useEffect(() => startPlaylistSync(), []);
  useEffect(() => startDailySync(), []);
  useEffect(() => startAppActions(), []);
  useEffect(() => startUpdateCheck(), []);
  useEffect(prefetchScreens, []);

  const covered = overlays.length > 0;
  useEffect(() => {
    document.body.classList.toggle('has-nav-bar', !covered);
  }, [covered]);

  return (
    <>
      {(Object.keys(TAB_SCREENS) as Tab[]).map((key) =>
        visited.has(key) ? (
          <section key={key} className="tab" data-active={key === tab} inert={key !== tab || covered}>
            <Suspense fallback={null}>{TAB_SCREENS[key]()}</Suspense>
          </section>
        ) : null,
      )}
      {!covered && <NavigationBar />}
      {overlays.map((overlay, i) => (
        <div key={overlay.key} className="overlay-layer" inert={i < overlays.length - 1}>
          <Suspense fallback={null}>
            <OverlayView overlay={overlay} />
          </Suspense>
        </div>
      ))}
    </>
  );
}

function OverlayView({ overlay }: { overlay: OverlayEntry }) {
  switch (overlay.type) {
    case 'preview':
      return <PreviewScreen wallpaper={overlay.wallpaper} list={overlay.list} />;
    case 'search':
      return <SearchScreen />;
    case 'pack':
      return <PackScreen packId={overlay.packId} />;
    case 'collection':
      return <CollectionScreen collectionId={overlay.collectionId} />;
    case 'diagnostics':
      return <DiagnosticsScreen />;
    case 'dynamic':
      return <DynamicScreen />;
    case 'live':
      return <LiveScreen />;
    case 'rotation':
      return <RotationScreen />;
    case 'music':
      return <MusicScreen />;
    case 'places':
      return <PlacesScreen />;
    case 'editor':
      return <EditorScreen wallpaper={overlay.wallpaper} crop={overlay.crop} />;
    case 'generator':
      return <GeneratorScreen />;
    case 'focus':
      return <FocusScreen />;
    case 'similar':
      return <SimilarScreen wallpaper={overlay.wallpaper} />;
    case 'photographer':
      return <PhotographerScreen photographer={overlay.photographer} />;
    case 'hidden':
      return <HiddenScreen />;
    case 'events':
      return <EventsScreen />;
    case 'dim':
      return <DimScreen />;
    case 'quote':
      return <QuoteScreen />;
  }
}

/** Bouton retour Android (et Échap dans le navigateur) : feuilles, puis écrans, puis onglet Explorer. */
function useBackButton() {
  useEffect(() => {
    const onBack = () => {
      if (handleBack()) return;
      const nav = useNavigation.getState();
      if (nav.overlays.length > 0) nav.pop();
      else if (nav.tab !== 'explore') nav.setTab('explore');
      else if (isNative) void CapacitorApp.minimizeApp();
    };
    const handle = isNative ? CapacitorApp.addListener('backButton', onBack) : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      void handle?.then((h) => h.remove());
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}
