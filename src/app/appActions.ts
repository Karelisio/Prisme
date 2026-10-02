import { openDaily } from '@/features/discover/dailyActions';
import { type AppAction, PrismeSystem } from '@/shared/native/system';
import { useNavigation } from './navigation';

function run(action: AppAction | null) {
  if (action === 'DAILY') {
    void openDaily();
    return;
  }
  if (action !== 'SEARCH') return;
  const nav = useNavigation.getState();
  if (nav.overlays.at(-1)?.type !== 'search') nav.push({ type: 'search' });
}

/** Actions qui ouvrent l'app (raccourci « Rechercher », notification du jour) : au lancement ou app ouverte. */
export function startAppActions(): () => void {
  void PrismeSystem.getPendingAction().then(
    (r) => run(r.action),
    () => undefined,
  );
  const handle = PrismeSystem.addListener('appAction', (e) => run(e.action));
  return () => void handle.then((h) => h.remove());
}
