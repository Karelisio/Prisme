import { useMemo, useState } from 'react';
import { useLibrary } from '@/features/library/store';
import { useThumbSrc } from '@/features/library/useImageSrc';
import { importFromGallery } from '@/features/sources/device';
import type { Wallpaper } from '@/features/sources/types';
import { FAVORITES_SOURCE, rotationItems } from '@/features/automation/model';
import { CREATIONS_ID } from '@/features/library/creations';
import { t } from '@/shared/i18n';
import { type WallpaperTarget, nativeErrorMessage } from '@/shared/native';
import { Button, Chip, EmptyState, Icon } from '@/shared/ui/components';
import type { IconName } from '@/shared/ui/icons';
import { BottomSheet, showSnackbar } from '@/shared/ui/overlays';
import './automation.css';

export const TARGET_CHOICES: readonly { value: WallpaperTarget; label: string }[] = [
  { value: 'home', label: 'Accueil' },
  { value: 'lock', label: 'Verrouillage' },
  { value: 'both', label: 'Les deux' },
];

export function TargetChips({ value, onChange }: { value: WallpaperTarget; onChange: (target: WallpaperTarget) => void }) {
  return (
    <div className="chip-wrap" aria-label={t('Écran visé')}>
      {TARGET_CHOICES.map((choice) => (
        <Chip key={choice.value} selected={value === choice.value} onClick={() => onChange(choice.value)}>
          {t(choice.label)}
        </Chip>
      ))}
    </div>
  );
}

/** Nom d'une collection : « Créations », créée par l'app, suit la langue ; les autres sont des noms choisis par l'utilisateur. */
export const collectionLabel = (collection: { id: string; name: string }): string => (collection.id === CREATIONS_ID ? t(collection.name) : collection.name);

function PickerThumb({ wallpaper, onPick }: { wallpaper: Wallpaper; onPick: (w: Wallpaper) => void }) {
  const src = useThumbSrc(wallpaper);
  return (
    <button type="button" className="picker__item" style={{ backgroundColor: wallpaper.color }} onClick={() => onPick(wallpaper)} aria-label={wallpaper.alt}>
      <img src={src} alt="" loading="lazy" decoding="async" />
    </button>
  );
}

/** Choix d'un fond dans la bibliothèque (favoris, collections) ou depuis la galerie. */
export function WallpaperPicker({
  open,
  title,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onPick: (w: Wallpaper) => void;
}) {
  const favorites = useLibrary((s) => s.favorites);
  const items = useLibrary((s) => s.items);
  const collections = useLibrary((s) => s.collections);
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);
  const [source, setSource] = useState(FAVORITES_SOURCE);
  const list = useMemo(() => rotationItems(source, { favorites, items, collections }), [source, favorites, items, collections]);

  const pick = (w: Wallpaper) => {
    onPick(w);
    onClose();
  };

  const importImage = async () => {
    try {
      const w = await importFromGallery();
      if (!w) return;
      // Gardé dans les favoris pour que l'automatisme le retrouve, même hors ligne.
      if (!useLibrary.getState().favorites[w.id]) toggleFavorite(w);
      pick(w);
    } catch (error) {
      showSnackbar(t('Import impossible : {message}', { message: nativeErrorMessage(error) }));
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="chip-row">
        <Chip selected={source === FAVORITES_SOURCE} onClick={() => setSource(FAVORITES_SOURCE)}>
          {t('Favoris')}
        </Chip>
        {collections.map((c) => (
          <Chip key={c.id} selected={source === c.id} onClick={() => setSource(c.id)}>
            {collectionLabel(c)}
          </Chip>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon="favorite"
          title={t("Rien ici pour l'instant")}
          text={t('Ajoute des fonds aux favoris ou à une collection, ou importe une image.')}
        />
      ) : (
        <div className="picker">
          {list.map((w) => (
            <PickerThumb key={w.id} wallpaper={w} onPick={pick} />
          ))}
        </div>
      )}
      <div className="sheet__actions">
        <Button variant="tonal" icon="addPhoto" onClick={() => void importImage()}>
          {t('Importer')}
        </Button>
      </div>
    </BottomSheet>
  );
}

/** Ligne « condition → fond » : vignette du fond choisi, appui pour changer. */
export function RefRow({
  icon,
  label,
  supporting,
  wallpaperId,
  onChoose,
  onClear,
  children,
}: {
  icon: IconName;
  label: string;
  supporting?: string;
  wallpaperId: string | null | undefined;
  onChoose: () => void;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  const wallpaper = useLibrary((s) => (wallpaperId ? s.items[wallpaperId] : undefined));
  return (
    <div className="ref-row">
      <span className="ref-row__icon">
        <Icon name={icon} />
      </span>
      <span className="ref-row__text">
        <span className="ref-row__label">{label}</span>
        {supporting && <span className="ref-row__supporting">{supporting}</span>}
        {children}
      </span>
      {wallpaper ? (
        <span className="ref-row__chosen">
          <button type="button" className="ref-row__thumb" onClick={onChoose} aria-label={t('Changer le fond « {label} »', { label })}>
            <RefThumb wallpaper={wallpaper} />
          </button>
          <button type="button" className="ref-row__clear" onClick={onClear} aria-label={t('Retirer le fond « {label} »', { label })}>
            <Icon name="close" size={16} />
          </button>
        </span>
      ) : (
        <Button variant="outlined" onClick={onChoose} aria-label={t('Choisir le fond « {label} »', { label })}>
          {t('Choisir')}
        </Button>
      )}
    </div>
  );
}

function RefThumb({ wallpaper }: { wallpaper: Wallpaper }) {
  const src = useThumbSrc(wallpaper);
  return <img src={src} alt="" style={{ backgroundColor: wallpaper.color }} />;
}
