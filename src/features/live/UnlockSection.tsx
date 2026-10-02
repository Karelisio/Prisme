import { useMemo } from 'react';
import { FAVORITES_SOURCE, rotationItems } from '@/features/automation/model';
import { useLibrary } from '@/features/library/store';
import type { LiveStatus } from '@/shared/native/automation';
import { Chip, Icon, ListItem, Switch } from '@/shared/ui/components';
import { useLive } from './live';
import { PLAYLIST_LIMIT, UNLOCK_FREQUENCIES, type UnlockPrefs } from './playlist';

const fonds = (n: number) => `${n} fond${n > 1 ? 's' : ''}`;
const prets = (n: number) => `${fonds(n)} prêt${n > 1 ? 's' : ''}`;

/**
 * « Changer à chaque déverrouillage » : avec le fond animé Prisme actif, l'image change tous les N
 * déverrouillages, parmi les favoris ou une collection. Le natif prépare les images à l'avance.
 */
export function UnlockSection({ optionOn, status, onChanged }: { optionOn: boolean; status: LiveStatus | undefined; onChanged: () => void }) {
  const unlock = useLive((s) => s.unlock);
  const updateUnlock = useLive((s) => s.updateUnlock);
  const favorites = useLibrary((s) => s.favorites);
  const items = useLibrary((s) => s.items);
  const collections = useLibrary((s) => s.collections);
  const count = useMemo(
    () => rotationItems(unlock.source, { favorites, items, collections }).length,
    [unlock.source, favorites, items, collections],
  );
  const live = optionOn && !!status?.active;
  const total = Math.min(count, PLAYLIST_LIMIT);
  const prepared = status?.playlist.enabled ? status.playlist.count : 0;

  const update = (patch: Partial<UnlockPrefs>) => {
    updateUnlock(patch);
    onChanged();
  };

  const used = count > PLAYLIST_LIMIT ? `Les ${PLAYLIST_LIMIT} fonds les plus récents de la source` : fonds(count);
  let help: string;
  if (count < 2) help = 'Il faut au moins deux fonds dans la source choisie.';
  else if (!unlock.enabled || !live) help = `${used} seront préparés sur l’appareil, pour changer d’image sans connexion.`;
  else if (!status?.playlist.enabled) help = 'Préparation des images…';
  else if (prepared < total) help = `${prets(prepared)} sur ${total} : les images sont préparées en arrière-plan.`;
  else help = `${prets(prepared)}, disponibles sans connexion.`;

  return (
    <section className="live-unlock">
      <ListItem
        headline="Changer à chaque déverrouillage"
        supporting={unlock.every === 1 ? 'Une nouvelle image à chaque déverrouillage' : `Une nouvelle image tous les ${unlock.every} déverrouillages`}
        leading={<Icon name="mobileLock" />}
        trailing={
          <Switch
            label="Changer à chaque déverrouillage"
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
            ? 'Active d’abord le fond animé Prisme (bouton « Activer le fond animé » ci-dessus) : l’image ne change qu’avec lui.'
            : 'Active l’option Fond animé (interrupteur en haut de l’écran) pour changer d’image à chaque déverrouillage.'}
        </div>
      )}

      <div className="option-block">
        <h2 className="option-block__title">Fréquence</h2>
        <div className="chip-wrap" role="group" aria-label="Fréquence du changement">
          {UNLOCK_FREQUENCIES.map(({ every, label }) => (
            <Chip key={every} selected={unlock.every === every} onClick={() => update({ every })}>
              {label}
            </Chip>
          ))}
        </div>
        <p className="option-hint">Nombre de déverrouillages entre deux changements d’image.</p>
      </div>

      <div className="option-block">
        <h2 className="option-block__title">Source</h2>
        <div className="chip-wrap">
          <Chip selected={unlock.source === FAVORITES_SOURCE} onClick={() => update({ source: FAVORITES_SOURCE })}>
            Favoris ({Object.keys(favorites).length})
          </Chip>
          {collections.map((c) => (
            <Chip key={c.id} selected={unlock.source === c.id} onClick={() => update({ source: c.id })}>
              {c.name} ({c.itemIds.length})
            </Chip>
          ))}
        </div>
        <p className="option-hint" role="status">
          {help}
        </p>
      </div>
    </section>
  );
}
