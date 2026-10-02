import { useSettings } from '@/features/settings/store';
import { locale, t } from '@/shared/i18n';
import { Icon, ListItem, Switch } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { checkForUpdate, openUpdateSheet, useUpdates } from './useUpdates';

function checkedLabel(at: number, now = Date.now()): string {
  if (!at) return t('jamais vérifié');
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return t('vérifié à l’instant');
  if (minutes < 60) return t('vérifié il y a {minutes} min', { minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('vérifié il y a {hours} h', { hours });
  return t('vérifié le {date}', { date: new Date(at).toLocaleDateString(locale(), { day: 'numeric', month: 'long' }) });
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
    else if (result === 'up-to-date') showSnackbar(t('Prisme est à jour'));
    else showSnackbar(t('Impossible de vérifier les mises à jour (connexion ?)'));
  };

  return (
    <>
      <ListItem
        headline={available ? t('Mise à jour {version} disponible', { version: available.version }) : t('Rechercher une mise à jour')}
        supporting={
          checking
            ? t('Recherche…')
            : t('Version {version} · {status}', { version: __APP_VERSION__, status: available ? t('appuie pour installer') : checkedLabel(lastCheckedAt) })
        }
        leading={<Icon name="update" />}
        onClick={() => void onCheck()}
        disabled={checking}
      />
      <ListItem
        headline={t('Vérifier automatiquement')}
        supporting={t('Au lancement, au plus toutes les 6 heures')}
        leading={<Icon name="autorenew" />}
        trailing={<Switch label={t('Vérifier automatiquement')} checked={auto} onChange={(autoUpdateCheck) => update({ autoUpdateCheck })} />}
      />
    </>
  );
}
