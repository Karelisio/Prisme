import { useMemo, useState } from 'react';
import type { Wallpaper } from '@/features/sources/types';
import { haptic } from '@/shared/lib/haptics';
import { Button, Chip, TextField } from '@/shared/ui/components';
import { BottomSheet, showSnackbar } from '@/shared/ui/overlays';
import { MAX_TAGS_PER_WALLPAPER, MAX_TAG_LENGTH, cleanTag, sameTag, tagCounts } from './model';
import { useLibrary } from './store';
import './library.css';

const NO_TAGS: string[] = [];

/** Étiquettes d'un fond : retrait, ajout, et reprise des étiquettes déjà utilisées ailleurs. */
export function TagsSheet({ wallpaper, open, onClose }: { wallpaper: Wallpaper | null; open: boolean; onClose: () => void }) {
  const id = wallpaper?.id ?? '';
  const tags = useLibrary((s) => s.tags[id]) ?? NO_TAGS;
  const favorite = useLibrary((s) => !!s.favorites[id]);
  const allTags = useLibrary((s) => s.tags);
  const favorites = useLibrary((s) => s.favorites);
  const addTag = useLibrary((s) => s.addTag);
  const removeTag = useLibrary((s) => s.removeTag);
  const [text, setText] = useState('');

  const suggestions = useMemo(
    () => tagCounts({ tags: allTags, favorites }).filter((c) => !tags.some((t) => sameTag(t, c.tag))),
    [allTags, favorites, tags],
  );
  const full = tags.length >= MAX_TAGS_PER_WALLPAPER;

  const add = (raw: string) => {
    const tag = cleanTag(raw);
    if (!wallpaper || !tag || full) return;
    addTag(wallpaper, tag);
    haptic('tick');
    if (!favorite) showSnackbar(`Ajouté aux favoris, étiquette « ${tag} »`);
    setText('');
  };

  return (
    <BottomSheet open={open && !!wallpaper} onClose={onClose} title="Étiquettes">
      <div className="tags-sheet">
        {!favorite && <p className="tags-sheet__note">Étiqueter un fond l’ajoute à tes favoris.</p>}
        {tags.length > 0 ? (
          <div className="library-chips library-chips--wrap" role="group" aria-label="Étiquettes de ce fond">
            {tags.map((tag) => (
              <Chip key={tag} icon="close" aria-pressed={undefined} aria-label={`Retirer l’étiquette ${tag}`} onClick={() => wallpaper && removeTag(wallpaper.id, tag)}>
                {tag}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="tags-sheet__note">Aucune étiquette pour l’instant.</p>
        )}
        <form
          className="tags-sheet__form"
          onSubmit={(e) => {
            e.preventDefault();
            add(text);
          }}
        >
          <TextField
            label="Nouvelle étiquette"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_TAG_LENGTH}
            disabled={full}
            autoComplete="off"
            enterKeyHint="done"
          />
          <Button type="submit" variant="tonal" icon="add" disabled={full || !cleanTag(text)}>
            Ajouter
          </Button>
        </form>
        {full && <p className="tags-sheet__note">{MAX_TAGS_PER_WALLPAPER} étiquettes au plus par fond.</p>}
        {suggestions.length > 0 && !full && (
          <>
            <h3 className="tags-sheet__label">Déjà utilisées</h3>
            <div className="library-chips library-chips--wrap" role="group" aria-label="Étiquettes déjà utilisées">
              {suggestions.map(({ tag }) => (
                <Chip key={tag} icon="add" aria-pressed={undefined} onClick={() => add(tag)}>
                  {tag}
                </Chip>
              ))}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
