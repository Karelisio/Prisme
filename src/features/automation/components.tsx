import { useMemo, useState } from 'react';
import { useLibrary } from '@/features/library/store';
import { useThumbSrc } from '@/features/library/useImageSrc';
import { importFromGallery } from '@/features/sources/device';
import type { Wallpaper } from '@/features/sources/types';
import { FAVORITES_SOURCE, rotationItems } from '@/features/automation/model';
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

export function TargetChips({ value, onChange }: { value: WallpaperTarget; onChange: (t: WallpaperTarget) => void }) {
  return (
    <div className="chip-wrap" aria-label="Écran visé">
      {TARGET_CHOICES.map((t) => (
        <Chip key={t.value} selected={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}
        </Chip>
      ))}
    </div>
  );
}

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
      showSnackbar(`Import impossible : ${nativeErrorMessage(error)}`);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="chip-row">
        <Chip selected={source === FAVORITES_SOURCE} onClick={() => setSource(FAVORITES_SOURCE)}>
          Favoris
        </Chip>
        {collections.map((c) => (
          <Chip key={c.id} selected={source === c.id} onClick={() => setSource(c.id)}>
            {c.name}
          </Chip>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState icon="favorite" title="Rien ici pour l'instant" text="Ajoute des fonds aux favoris ou à une collection, ou importe une image." />
      ) : (
        <div className="picker">
          {list.map((w) => (
            <PickerThumb key={w.id} wallpaper={w} onPick={pick} />
          ))}
        </div>
      )}
      <div className="sheet__actions">
        <Button variant="tonal" icon="addPhoto" onClick={() => void importImage()}>
          Importer
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
          <button type="button" className="ref-row__thumb" onClick={onChoose} aria-label={`Changer le fond « ${label} »`}>
            <RefThumb wallpaper={wallpaper} />
          </button>
          <button type="button" className="ref-row__clear" onClick={onClear} aria-label={`Retirer le fond « ${label} »`}>
            <Icon name="close" size={16} />
          </button>
        </span>
      ) : (
        <Button variant="outlined" onClick={onChoose} aria-label={`Choisir le fond « ${label} »`}>
          Choisir
        </Button>
      )}
    </div>
  );
}

function RefThumb({ wallpaper }: { wallpaper: Wallpaper }) {
  const src = useThumbSrc(wallpaper);
  return <img src={src} alt="" style={{ backgroundColor: wallpaper.color }} />;
}
