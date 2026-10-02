import { REMOTE_SOURCES, SOURCE_INFO, hasKey } from '@/features/sources/registry';
import type { RemoteSource } from '@/features/sources/types';
import { Icon, ListItem, Switch } from '@/shared/ui/components';
import type { IconName } from '@/shared/ui/icons';
import { useSettings } from './store';

const SOURCE_ICONS: Record<RemoteSource, IconName> = {
  unsplash: 'image',
  pexels: 'image',
  wallhaven: 'wallpaper',
  pixabay: 'image',
  art: 'formatPaint',
  nasa: 'stars',
};

/**
 * Une ligne par source en ligne, avec son interrupteur. Les clés d'API sont fournies au build :
 * une source sans clé est signalée et ne peut pas être activée.
 */
export function SourceToggles() {
  const sources = useSettings((s) => s.sources);
  const update = useSettings((s) => s.update);
  return (
    <>
      {REMOTE_SOURCES.map((source) => {
        const info = SOURCE_INFO[source];
        const usable = hasKey(source);
        return (
          <ListItem
            key={source}
            headline={info.name}
            supporting={usable ? info.description : 'Clé API absente de ce build'}
            leading={<Icon name={SOURCE_ICONS[source]} />}
            trailing={
              <Switch
                label={info.name}
                checked={usable && sources[source]}
                disabled={!usable}
                onChange={(on) => update({ sources: { ...sources, [source]: on } })}
              />
            }
          />
        );
      })}
    </>
  );
}
