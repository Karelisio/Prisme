import { useMemo, useRef, useState } from 'react';
import { useNavigation } from '@/app/navigation';
import { DailyCard } from '@/features/discover/DailyCard';
import { FollowingView } from '@/features/discover/FollowingView';
import { ForYouView } from '@/features/discover/ForYouView';
import { useDiscover } from '@/features/discover/store';
import { PacksList } from '@/features/packs/PacksList';
import { RATIO_OPTIONS, colorLabel, colorSwatch } from '@/features/sources/filters';
import { useSettings } from '@/features/settings/store';
import { useOnline } from '@/shared/lib/useOnline';
import { Chip, Icon, IconButton } from '@/shared/ui/components';
import { CATEGORIES } from './categories';
import { FeedView } from './FeedView';
import { FilterSheet } from './FilterSheet';
import { importAndPreview } from './importAction';
import { filtersActive, useBrowse } from './store';
import './browse.css';

export function ExploreScreen() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const category = useBrowse((s) => s.category);
  const setCategory = useBrowse((s) => s.setCategory);
  const filters = useBrowse((s) => s.filters);
  const push = useNavigation((s) => s.push);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const generator = useSettings((s) => s.features.generator);
  const following = useDiscover((s) => s.following.length > 0);
  const spec = useMemo(() => CATEGORIES.find((c) => c.key === category) ?? CATEGORIES[0]!, [category]);
  const [featured, ...themes] = CATEGORIES;

  const select = (key: string) => {
    setCategory(key);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  return (
    <div ref={scrollRef} className="screen screen--tab">
      <div className="explore-top">
        <div className="search-bar">
          <button type="button" className="search-bar__launch" onClick={() => push({ type: 'search' })}>
            <Icon name="search" />
            <span>Rechercher des fonds</span>
          </button>
          <IconButton icon="addPhoto" label="Importer depuis la galerie" onClick={() => void importAndPreview()} />
          <IconButton icon="tune" label="Filtres" selected={filtersActive(filters)} onClick={() => setFiltersOpen(true)} />
        </div>
      </div>

      <nav className="chip-row" aria-label="Catégories">
        {generator && (
          <Chip icon="wandStars" onClick={() => push({ type: 'generator' })}>
            Créer
          </Chip>
        )}
        <Chip icon="layers" selected={category === 'packs'} onClick={() => select('packs')}>
          Packs
        </Chip>
        {featured && (
          <Chip selected={category === featured.key} onClick={() => select(featured.key)}>
            {featured.label}
          </Chip>
        )}
        <Chip icon="favorite" selected={category === 'foryou'} onClick={() => select('foryou')}>
          Pour toi
        </Chip>
        {(following || category === 'following') && (
          <Chip icon="group" selected={category === 'following'} onClick={() => select('following')}>
            Abonnements
          </Chip>
        )}
        {themes.map((c) => (
          <Chip key={c.key} selected={category === c.key} onClick={() => select(c.key)}>
            {c.label}
          </Chip>
        ))}
      </nav>

      {category !== 'packs' && <ActiveFilters onEdit={() => setFiltersOpen(true)} />}
      <OfflineBanner />

      {category === 'packs' ? (
        <PacksList />
      ) : category === 'foryou' ? (
        <ForYouView scrollRef={scrollRef} />
      ) : category === 'following' ? (
        <FollowingView scrollRef={scrollRef} />
      ) : (
        <>
          {spec.key === 'featured' && <DailyCard />}
          <FeedView key={spec.key} spec={spec} scrollRef={scrollRef} />
        </>
      )}

      <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} />
    </div>
  );
}

export function ActiveFilters({ onEdit }: { onEdit: () => void }) {
  const filters = useBrowse((s) => s.filters);
  const setFilters = useBrowse((s) => s.setFilters);
  if (!filtersActive(filters)) return null;
  const color = filters.color;
  const ratio = RATIO_OPTIONS.find((o) => o.value === filters.ratio);
  return (
    <div className="active-filters" aria-label="Filtres actifs">
      {color && (
        <Chip
          swatch={colorSwatch(color)}
          selected
          onClick={() => setFilters({ ...filters, color: null })}
          aria-label={`Retirer le filtre ${colorLabel(color)}`}
        >
          {colorLabel(color)} ✕
        </Chip>
      )}
      {filters.amoled && (
        <Chip selected onClick={() => setFilters({ ...filters, amoled: false })} aria-label="Retirer le filtre AMOLED">
          AMOLED ✕
        </Chip>
      )}
      {filters.ratio !== 'all' && ratio && (
        <Chip selected onClick={() => setFilters({ ...filters, ratio: 'all' })} aria-label={`Retirer le filtre ${ratio.label}`}>
          {ratio.label} ✕
        </Chip>
      )}
      <button type="button" className="active-filters__edit" onClick={onEdit}>
        Modifier
      </button>
    </div>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <Icon name="cloudOff" size={20} />
      Hors ligne : contenu en cache, favoris et historique disponibles.
    </div>
  );
}
