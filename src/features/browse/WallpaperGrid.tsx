import { useVirtualizer } from '@tanstack/react-virtual';
import { type ReactNode, type RefObject, memo, useCallback, useEffect, useRef, useState } from 'react';
import { openPreview } from '@/app/navigation';
import { useLibrary } from '@/features/library/store';
import { useThumbSrc } from '@/features/library/useImageSrc';
import { useSettings } from '@/features/settings/store';
import type { Wallpaper } from '@/features/sources/types';
import { Icon } from '@/shared/ui/components';

const GAP = 8;
const CELL_RATIO = 16 / 9;

interface GridProps {
  items: Wallpaper[];
  /** Conteneur qui défile (l'onglet ou l'écran) : la grille est virtualisée par rapport à lui. */
  scrollRef: RefObject<HTMLElement | null>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onEndReached?: () => void;
  onOpen?: (w: Wallpaper) => void;
  footer?: ReactNode;
}

/** Grille virtualisée : seules les lignes proches de l'écran existent dans le DOM. */
export function WallpaperGrid({ items, scrollRef, hasMore, loadingMore, onEndReached, onOpen, footer }: GridProps) {
  const columns = useSettings((s) => s.gridColumns);
  // Par défaut, l'aperçu reçoit toute la grille pour pouvoir passer d'un fond à l'autre.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const open = useCallback((w: Wallpaper) => (onOpen ? onOpen(w) : openPreview(w, itemsRef.current)), [onOpen]);
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);

  // Effet passif : au premier montage, la réf du conteneur parent n'est attachée qu'après les effets de mise en page des enfants.
  useEffect(() => {
    const grid = gridRef.current;
    const scroller = scrollRef.current ?? grid?.closest<HTMLElement>('.screen');
    if (!grid || !scroller) return;
    const measure = () => {
      setWidth(grid.clientWidth);
      setOffset(grid.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    if (grid.parentElement) observer.observe(grid.parentElement);
    return () => observer.disconnect();
  }, [scrollRef]);

  const cellWidth = width > 0 ? (width - GAP * (columns - 1)) / columns : 0;
  const rowHeight = cellWidth * CELL_RATIO + GAP;
  const rowCount = Math.ceil(items.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight || 300,
    overscan: 3,
    scrollMargin: offset,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  const rows = virtualizer.getVirtualItems();
  const lastIndex = rows[rows.length - 1]?.index ?? -1;

  useEffect(() => {
    if (hasMore && !loadingMore && rowCount > 0 && lastIndex >= rowCount - 4) onEndReached?.();
  }, [lastIndex, rowCount, hasMore, loadingMore, onEndReached]);

  return (
    <>
      <div ref={gridRef} className="wp-grid" style={{ height: width ? virtualizer.getTotalSize() : undefined }}>
        {width > 0 &&
          rows.map((row) => (
            <div
              key={row.key}
              className="wp-grid__row"
              style={{
                transform: `translateY(${row.start - offset}px)`,
                height: rowHeight - GAP,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {items.slice(row.index * columns, row.index * columns + columns).map((w) => (
                <WallpaperCell key={w.id} wallpaper={w} onOpen={open} />
              ))}
            </div>
          ))}
      </div>
      {footer}
    </>
  );
}

const WallpaperCell = memo(function WallpaperCell({ wallpaper, onOpen }: { wallpaper: Wallpaper; onOpen: (w: Wallpaper) => void }) {
  const src = useThumbSrc(wallpaper);
  const favorite = useLibrary((s) => !!s.favorites[wallpaper.id]);
  return (
    <button
      type="button"
      className="wp-cell"
      style={{ backgroundColor: wallpaper.color }}
      onClick={() => onOpen(wallpaper)}
      aria-label={wallpaper.author ? `${wallpaper.alt}, par ${wallpaper.author.name}` : wallpaper.alt}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={(e) => e.currentTarget.classList.add('is-loaded')}
      />
      {favorite && (
        <span className="wp-cell__badge">
          <Icon name="favoriteFill" size={16} />
        </span>
      )}
    </button>
  );
});

/** Squelette affiché pendant le premier chargement. */
export function GridSkeleton({ count = 8 }: { count?: number }) {
  const columns = useSettings((s) => s.gridColumns);
  return (
    <div className="wp-skeleton" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="wp-skeleton__cell" />
      ))}
    </div>
  );
}
