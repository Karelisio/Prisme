import { useMemo, useState } from 'react';
import type { Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';
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
    () => tagCounts({ tags: allTags, favorites }).filter((c) => !tags.some((tag) => sameTag(tag, c.tag))),
    [allTags, favorites, tags],
  );
  const full = tags.length >= MAX_TAGS_PER_WALLPAPER;

  const add = (raw: string) => {
    const tag = cleanTag(raw);
    if (!wallpaper || !tag || full) return;
    addTag(wallpaper, tag);
    haptic('tick');
    if (!favorite) showSnackbar(t('Ajouté aux favoris, étiquette « {tag} »', { tag }));
    setText('');
  };

  return (
    <BottomSheet open={open && !!wallpaper} onClose={onClose} title={t('Étiquettes')}>
      <div className="tags-sheet">
        {!favorite && <p className="tags-sheet__note">{t('Étiqueter un fond l’ajoute à tes favoris.')}</p>}
        {tags.length > 0 ? (
          <div className="library-chips library-chips--wrap" role="group" aria-label={t('Étiquettes de ce fond')}>
            {tags.map((tag) => (
              <Chip key={tag} icon="close" aria-pressed={undefined} aria-label={t('Retirer l’étiquette {tag}', { tag })} onClick={() => wallpaper && removeTag(wallpaper.id, tag)}>
                {tag}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="tags-sheet__note">{t('Aucune étiquette pour l’instant.')}</p>
        )}
        <form
          className="tags-sheet__form"
          onSubmit={(e) => {
            e.preventDefault();
            add(text);
          }}
        >
          <TextField
            label={t('Nouvelle étiquette')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_TAG_LENGTH}
            disabled={full}
            autoComplete="off"
            enterKeyHint="done"
          />
          <Button type="submit" variant="tonal" icon="add" disabled={full || !cleanTag(text)}>
            {t('Ajouter')}
          </Button>
        </form>
        {full && <p className="tags-sheet__note">{t('{max} étiquettes au plus par fond.', { max: MAX_TAGS_PER_WALLPAPER })}</p>}
        {suggestions.length > 0 && !full && (
          <>
            <h3 className="tags-sheet__label">{t('Déjà utilisées')}</h3>
            <div className="library-chips library-chips--wrap" role="group" aria-label={t('Étiquettes déjà utilisées')}>
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
