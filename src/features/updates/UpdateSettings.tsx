import { useSettings } from '@/features/settings/store';
import { Icon, ListItem, Switch } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { checkForUpdate, openUpdateSheet, useUpdates } from './useUpdates';

function checkedLabel(at: number, now = Date.now()): string {
  if (!at) return 'jamais vérifié';
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return 'vérifié à l’instant';
  if (minutes < 60) return `vérifié il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vérifié il y a ${hours} h`;
  return `vérifié le ${new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}

/** Réglages « À propos » : version installée, recherche de mise à jour, vérification automatique. */
export function UpdateSettings() {
  const available = useUpdates((s) => s.available);
  const checking = useUpdates((s) => s.checking);
  const lastCheckedAt = useUpdates((s) => s.lastCheckedAt);
  const auto = useSettings((s) => s.autoUpdateCheck);
  const update = useSettings((s) => s.update);

  const onCheck = async () => {
    if (available) {
      openUpdateSheet();
      return;
    }
    const result = await checkForUpdate();
    if (result === 'available') openUpdateSheet();
    else if (result === 'up-to-date') showSnackbar('Prisme est à jour');
    else showSnackbar('Impossible de vérifier les mises à jour (connexion ?)');
  };

  return (
    <>
      <ListItem
        headline={available ? `Mise à jour ${available.version} disponible` : 'Rechercher une mise à jour'}
        supporting={checking ? 'Recherche…' : `Version ${__APP_VERSION__} · ${available ? 'appuie pour installer' : checkedLabel(lastCheckedAt)}`}
        leading={<Icon name="update" />}
        onClick={() => void onCheck()}
        disabled={checking}
      />
      <ListItem
        headline="Vérifier automatiquement"
        supporting="Au lancement, au plus toutes les 6 heures"
        leading={<Icon name="autorenew" />}
        trailing={<Switch label="Vérifier automatiquement" checked={auto} onChange={(autoUpdateCheck) => update({ autoUpdateCheck })} />}
      />
    </>
  );
}
