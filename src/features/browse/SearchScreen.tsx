import { useMemo, useRef, useState } from 'react';
import { goBack } from '@/app/navigation';
import { Chip, Icon, IconButton, ListItem } from '@/shared/ui/components';
import { searchFeed } from './categories';
import { FeedView } from './FeedView';
import { FilterSheet } from './FilterSheet';
import { ActiveFilters } from './ExploreScreen';
import { filtersActive, useBrowse } from './store';

const IDEAS = ['Aurore boréale', 'Montagnes', 'Minimaliste', 'Plage', 'Forêt', 'Néon', 'Pluie', 'Désert', 'Galaxie', 'Fleurs'];

export function SearchScreen() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = useBrowse((s) => s.filters);
  const recent = useBrowse((s) => s.recentSearches);
  const addRecent = useBrowse((s) => s.addRecentSearch);
  const removeRecent = useBrowse((s) => s.removeRecentSearch);
  const spec = useMemo(() => (query ? searchFeed(query) : null), [query]);

  const submit = (value: string) => {
    const q = value.trim();
    if (!q) return;
    setText(q);
    setQuery(q);
    addRecent(q);
    inputRef.current?.blur();
    scrollRef.current?.scrollTo({ top: 0 });
  };

  return (
    <div ref={scrollRef} className="screen overlay-screen">
      <div className="search-top">
        <form
          className="search-bar"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
        >
          <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoFocus
            placeholder="Rechercher des fonds d'écran"
            aria-label="Rechercher"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {text && (
            <IconButton
              icon="close"
              label="Effacer"
              onClick={() => {
                setText('');
                setQuery(null);
                inputRef.current?.focus();
              }}
            />
          )}
          <IconButton icon="tune" label="Filtres" selected={filtersActive(filters)} onClick={() => setFiltersOpen(true)} />
        </form>
      </div>

      <ActiveFilters onEdit={() => setFiltersOpen(true)} />

      {spec ? (
        <FeedView key={spec.key} spec={spec} scrollRef={scrollRef} />
      ) : (
        <div className="search-suggestions">
          {recent.length > 0 && (
            <>
              <h2 className="list-subheader">Recherches récentes</h2>
              <ul className="list">
                {recent.map((r) => (
                  <li key={r} className="recent-item">
                    <ListItem headline={r} leading={<Icon name="history" />} onClick={() => submit(r)} />
                    <IconButton icon="close" label={`Oublier « ${r} »`} onClick={() => removeRecent(r)} />
                  </li>
                ))}
              </ul>
            </>
          )}
          <h2 className="list-subheader">Idées</h2>
          <div className="chip-wrap chip-wrap--padded">
            {IDEAS.map((idea) => (
              <Chip key={idea} onClick={() => submit(idea)}>
                {idea}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} />
    </div>
  );
}
