import { type AppAction, PrismeSystem } from '@/shared/native/system';
import { useNavigation } from './navigation';

function run(action: AppAction | null) {
  if (action !== 'SEARCH') return;
  const nav = useNavigation.getState();
  if (nav.overlays.at(-1)?.type !== 'search') nav.push({ type: 'search' });
}

/** Raccourcis de l'icône qui ouvrent l'app (« Rechercher ») : au lancement ou app déjà ouverte. */
export function startAppActions(): () => void {
  void PrismeSystem.getPendingAction().then(
    (r) => run(r.action),
    () => undefined,
  );
  const handle = PrismeSystem.addListener('appAction', (e) => run(e.action));
  return () => void handle.then((h) => h.remove());
}
