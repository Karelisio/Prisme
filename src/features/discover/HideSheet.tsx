import { type FormEvent, useState } from 'react';
import type { Wallpaper } from '@/features/sources/types';
import { Button, Chip, Icon, ListItem, TextField } from '@/shared/ui/components';
import { BottomSheet } from '@/shared/ui/overlays';
import { authorKey } from './hidden';
import { keywordsOf } from './keywords';
import { useDiscover } from './store';
import './discover.css';

interface HideSheetProps {
  wallpaper: Wallpaper;
  open: boolean;
  onClose: () => void;
  /** Contenu masqué : message à afficher et action d'annulation. */
  onHidden: (message: string, undo: () => void) => void;
}

/** « Ne plus voir » : ce fond, son auteur ou un sujet. */
export function HideSheet({ wallpaper, open, onClose, onHidden }: HideSheetProps) {
  const store = useDiscover();
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const suggestions = keywordsOf(wallpaper, 8);
  const key = authorKey(wallpaper);

  const hideThis = () => {
    store.hideWallpaper(wallpaper);
    onHidden('Fond masqué', () => useDiscover.getState().unhideWallpaper(wallpaper.id));
  };

  const hideAuthor = () => {
    if (!key || !wallpaper.author) return;
    store.hideAuthor(wallpaper);
    onHidden(`Fonds de ${wallpaper.author.name} masqués`, () => useDiscover.getState().unhideAuthor(key));
  };

  const hideWord = (word: string) => {
    const w = word.trim();
    if (!w) return;
    store.addHiddenWord(w);
    onHidden(`Sujet « ${w} » masqué`, () => useDiscover.getState().removeHiddenWord(w));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    hideWord(custom);
    setCustom('');
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Ne plus voir">
      <ul className="list">
        <li>
          <ListItem headline="Ce fond" supporting="Retiré des grilles et des suggestions" leading={<Icon name="hideImage" />} onClick={hideThis} />
        </li>
        {wallpaper.author && key && (
          <li>
            <ListItem
              headline={`Les fonds de ${wallpaper.author.name}`}
              supporting="Tous ses fonds disparaissent des grilles"
              leading={<Icon name="personOff" />}
              onClick={hideAuthor}
            />
          </li>
        )}
        <li>
          <ListItem
            headline="Un sujet…"
            supporting="Les fonds dont la description contient ce mot"
            leading={<Icon name="label" />}
            onClick={() => setTopicsOpen((o) => !o)}
          />
        </li>
      </ul>
      {topicsOpen && (
        <div className="hide-topics">
          {suggestions.length > 0 && (
            <div className="chip-wrap" aria-label="Sujets de ce fond">
              {suggestions.map((word) => (
                <Chip key={word} icon="visibilityOff" onClick={() => hideWord(word)}>
                  {word}
                </Chip>
              ))}
            </div>
          )}
          <form className="hide-topics__form" onSubmit={submit}>
            <TextField label="Autre sujet" placeholder="ex. voiture, chat" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <Button type="submit" variant="tonal" disabled={!custom.trim()}>
              Masquer
            </Button>
          </form>
        </div>
      )}
    </BottomSheet>
  );
}
