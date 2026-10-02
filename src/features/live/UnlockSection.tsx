import { useMemo } from 'react';
import { collectionLabel } from '@/features/automation/components';
import { FAVORITES_SOURCE, rotationItems } from '@/features/automation/model';
import { useLibrary } from '@/features/library/store';
import { t, tn } from '@/shared/i18n';
import type { LiveStatus } from '@/shared/native/automation';
import { Chip, Icon, ListItem, Switch } from '@/shared/ui/components';
import { useLive } from './live';
import { PLAYLIST_LIMIT, UNLOCK_FREQUENCIES, type UnlockPrefs } from './playlist';

/**
 * « Changer à chaque déverrouillage » : avec le fond animé Prisme actif, l'image change tous les N
 * déverrouillages, parmi les favoris ou une collection. Le natif prépare les images à l'avance.
 */
export function UnlockSection({ optionOn, status, onChanged }: { optionOn: boolean; status: LiveStatus | undefined; onChanged: () => void }) {
  const unlock = useLive((s) => s.unlock);
  const updateUnlock = useLive((s) => s.updateUnlock);
  const doubleTap = useLive((s) => s.doubleTap);
  // La liste sert au déverrouillage comme au double-tap : elle est préparée dès que l'un des deux est actif.
  const listOn = unlock.enabled || doubleTap;
  const favorites = useLibrary((s) => s.favorites);
  const items = useLibrary((s) => s.items);
  const collections = useLibrary((s) => s.collections);
  const count = useMemo(
    () => rotationItems(unlock.source, { favorites, items, collections }).length,
    [unlock.source, favorites, items, collections],
  );
  // La liste n'agit que dans le fond animé des scènes (photo) : le fond vidéo n'est pas concerné.
  const live = optionOn && status?.component === 'scenes';
  const total = Math.min(count, PLAYLIST_LIMIT);
  const prepared = status?.playlist.enabled ? status.playlist.count : 0;

  const update = (patch: Partial<UnlockPrefs>) => {
    updateUnlock(patch);
    onChanged();
  };

  const used =
    count > PLAYLIST_LIMIT
      ? t('Les {limit} fonds les plus récents de la source', { limit: PLAYLIST_LIMIT })
      : tn(count, '{count} fond', '{count} fonds');
  let help: string;
  if (count < 2) help = t('Il faut au moins deux fonds dans la source choisie.');
  else if (!listOn || !live) help = t('{used} seront préparés sur l’appareil, pour changer d’image sans connexion.', { used });
  else if (!status?.playlist.enabled) help = t('Préparation des images…');
  else if (prepared < total) {
    const one = '{count} fond prêt sur {total} : les images sont préparées en arrière-plan.';
    const other = '{count} fonds prêts sur {total} : les images sont préparées en arrière-plan.';
    help = tn(prepared, one, other, { total });
  } else help = tn(prepared, '{count} fond prêt, disponible sans connexion.', '{count} fonds prêts, disponibles sans connexion.');

  return (
    <section className="live-unlock">
      <ListItem
        headline={t('Changer à chaque déverrouillage')}
        supporting={
          unlock.every === 1 ? t('Une nouvelle image à chaque déverrouillage') : t('Une nouvelle image tous les {count} déverrouillages', { count: unlock.every })
        }
        leading={<Icon name="mobileLock" />}
        trailing={
          <Switch
            label={t('Changer à chaque déverrouillage')}
            checked={unlock.enabled}
            disabled={!live && !unlock.enabled}
            onChange={(enabled) => update({ enabled })}
          />
        }
      />

      {status && !live && (
        <div className="option-status" role="status">
          <Icon name="info" />
          {optionOn
            ? t('Active d’abord le fond animé Prisme (bouton « Activer le fond animé » ci-dessus) : l’image ne change qu’avec lui.')
            : t('Active l’option Fond animé (interrupteur en haut de l’écran) pour changer d’image à chaque déverrouillage.')}
        </div>
      )}

      <div className="option-block">
        <h2 className="option-block__title">{t('Fréquence')}</h2>
        <div className="chip-wrap" role="group" aria-label={t('Fréquence du changement')}>
          {UNLOCK_FREQUENCIES.map(({ every, label }) => (
            <Chip key={every} selected={unlock.every === every} onClick={() => update({ every })}>
              {t(label)}
            </Chip>
          ))}
        </div>
        <p className="option-hint">{t('Nombre de déverrouillages entre deux changements d’image.')}</p>
      </div>

      <div className="option-block">
        <h2 className="option-block__title">{t('Source')}</h2>
        <div className="chip-wrap">
          <Chip selected={unlock.source === FAVORITES_SOURCE} onClick={() => update({ source: FAVORITES_SOURCE })}>
            {t('Favoris ({count})', { count: Object.keys(favorites).length })}
          </Chip>
          {collections.map((c) => (
            <Chip key={c.id} selected={unlock.source === c.id} onClick={() => update({ source: c.id })}>
              {collectionLabel(c)} ({c.itemIds.length})
            </Chip>
          ))}
        </div>
        <p className="option-hint" role="status">
          {help}
        </p>
        {doubleTap && <p className="option-hint">{t('Le double-tap passe aussi à l’image suivante de cette liste.')}</p>}
      </div>
    </section>
  );
}
