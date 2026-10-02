import { useVirtualizer } from '@tanstack/react-virtual';
import { type ReactNode, type RefObject, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openPreview } from '@/app/navigation';
import { useLibrary } from '@/features/library/store';
import { useThumbSrc } from '@/features/library/useImageSrc';
import { useSettings } from '@/features/settings/store';
import type { Wallpaper } from '@/features/sources/types';
import { useLongPress } from '@/shared/lib/useLongPress';
import { Icon } from '@/shared/ui/components';
import { CELL_RATIO, GRID_GAP, GRID_MARGIN, type MosaicTile, columnCount, layoutMosaic, mosaicColumns, tileRatio, visibleTiles } from './mosaic';

interface GridProps {
  items: Wallpaper[];
  /** Conteneur qui défile (l'onglet ou l'écran) : la grille est virtualisée par rapport à lui. */
  scrollRef: RefObject<HTMLElement | null>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onEndReached?: () => void;
  onOpen?: (w: Wallpaper) => void;
  /** Appui long sur une vignette (étiquettes des favoris). */
  onLongPress?: (w: Wallpaper) => void;
  footer?: ReactNode;
}

/**
 * Grille de fonds, selon le réglage « Galerie » : 2, 3 ou 4 colonnes égales, ou mosaïque.
 * Dans les deux cas elle est virtualisée : seules les vignettes proches de l'écran existent dans le DOM.
 */
export function WallpaperGrid(props: GridProps) {
  const layout = useSettings((s) => s.gridLayout);
  return layout === 'mosaic' ? <MosaicGrid {...props} /> : <ColumnsGrid {...props} columns={Number(layout)} />;
}

/** Largeur de la grille et position de son haut dans le conteneur qui défile. */
function useGridFrame(scrollRef: RefObject<HTMLElement | null>) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 0, offset: 0 });

  // Effet passif : au premier montage, la réf du conteneur parent n'est attachée qu'après les effets de mise en page des enfants.
  useEffect(() => {
    const grid = gridRef.current;
    const scroller = scrollRef.current ?? grid?.closest<HTMLElement>('.screen');
    if (!grid || !scroller) return;
    const measure = () => {
      const width = grid.clientWidth;
      const offset = grid.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      setFrame((f) => (f.width === width && f.offset === offset ? f : { width, offset }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    if (grid.parentElement) observer.observe(grid.parentElement);
    return () => observer.disconnect();
  }, [scrollRef]);

  return { gridRef, width: frame.width, offset: frame.offset };
}

/** Ouverture d'un fond : par défaut, l'aperçu reçoit toute la grille pour passer d'un fond à l'autre. */
function useOpen(items: Wallpaper[], onOpen: GridProps['onOpen']) {
  const itemsRef = useRef(items);
  itemsRef.current = items;
  return useCallback(
    (w: Wallpaper, from: HTMLElement) => (onOpen ? onOpen(w) : openPreview(w, itemsRef.current, from)),
    [onOpen],
  );
}

type OpenHandler = ReturnType<typeof useOpen>;

/** Grille à colonnes égales : une rangée = une ligne de la liste virtualisée. */
function ColumnsGrid({ items, scrollRef, hasMore, loadingMore, onEndReached, onOpen, onLongPress, footer, columns }: GridProps & { columns: number }) {
  const open = useOpen(items, onOpen);
  const { gridRef, width, offset } = useGridFrame(scrollRef);
  const cellWidth = width > 0 ? (width - GRID_GAP * (columns - 1)) / columns : 0;
  const rowHeight = cellWidth * CELL_RATIO + GRID_GAP;
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
                height: rowHeight - GRID_GAP,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {items.slice(row.index * columns, row.index * columns + columns).map((w) => (
                <WallpaperCell key={w.id} wallpaper={w} onOpen={open} onLongPress={onLongPress} />
              ))}
            </div>
          ))}
      </div>
      {footer}
    </>
  );
}

/** Les fenêtres visibles sont arrondies à ce pas (px) : un rendu tous les 120 px de défilement, pas à chaque image. */
const WINDOW_STEP = 120;
/** Vignettes gardées au-delà de l'écran, de chaque côté (px). */
const OVERSCAN = 900;
/** La page suivante est demandée quand l'écran arrive à cette distance de la fin (px). */
const END_MARGIN = 1400;

/** Partie visible du conteneur qui défile, en px relatifs au haut de la grille. */
function useScrollWindow(scrollRef: RefObject<HTMLElement | null>, offset: number) {
  const [view, setView] = useState(() => ({ top: 0, bottom: window.innerHeight }));
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = Math.floor((scroller.scrollTop - offset) / WINDOW_STEP) * WINDOW_STEP;
      const bottom = top + scroller.clientHeight + WINDOW_STEP;
      setView((v) => (v.top === top && v.bottom === bottom ? v : { top, bottom }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', schedule);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef, offset]);
  return view;
}

/** Mosaïque : vignettes à la hauteur de leur image, réparties en colonnes équilibrées. */
function MosaicGrid({ items, scrollRef, hasMore, loadingMore, onEndReached, onOpen, onLongPress, footer }: GridProps) {
  const open = useOpen(items, onOpen);
  const { gridRef, width, offset } = useGridFrame(scrollRef);
  const view = useScrollWindow(scrollRef, offset);
  const columns = mosaicColumns(width);
  const layout = useMemo(() => (width > 0 ? layoutMosaic(items.map(tileRatio), columns, width) : null), [items, columns, width]);

  const nearEnd = !!layout && view.bottom + END_MARGIN >= layout.height;
  useEffect(() => {
    if (hasMore && !loadingMore && items.length > 0 && nearEnd) onEndReached?.();
  }, [nearEnd, hasMore, loadingMore, items.length, onEndReached]);

  const tiles = layout ? visibleTiles(layout, view.top - OVERSCAN, view.bottom + OVERSCAN) : [];
  return (
    <>
      <div ref={gridRef} className="wp-grid wp-grid--mosaic" style={{ height: layout?.height }} data-columns={columns}>
        {tiles.map((tile) => {
          const wallpaper = items[tile.index] as Wallpaper;
          return <WallpaperCell key={wallpaper.id} wallpaper={wallpaper} onOpen={open} onLongPress={onLongPress} tile={tile} />;
        })}
      </div>
      {footer}
    </>
  );
}

const WallpaperCell = memo(function WallpaperCell({
  wallpaper,
  onOpen,
  onLongPress,
  tile,
}: {
  wallpaper: Wallpaper;
  onOpen: OpenHandler;
  onLongPress?: (w: Wallpaper) => void;
  /** Mosaïque : position et taille calculées ; sinon la cellule remplit sa case de grille. */
  tile?: MosaicTile;
}) {
  const src = useThumbSrc(wallpaper);
  const favorite = useLibrary((s) => !!s.favorites[wallpaper.id]);
  const press = useLongPress(onLongPress && (() => onLongPress(wallpaper)));
  return (
    <button
      type="button"
      className="wp-cell"
      data-wp={wallpaper.id}
      style={{
        backgroundColor: wallpaper.color,
        ...(tile && { width: tile.width, height: tile.height, translate: `${tile.x}px ${tile.y}px` }),
      }}
      onClick={(e) => onOpen(wallpaper, e.currentTarget)}
      {...press}
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

/** Formats des cases du squelette de la mosaïque (hauteur / largeur), repris en boucle. */
const SKELETON_RATIOS = [1.7, 1.15, 2, 1.4, 0.9, 1.8];

/** Squelette affiché pendant le premier chargement, à l'image de la grille choisie. */
export function GridSkeleton({ count = 8 }: { count?: number }) {
  const layout = useSettings((s) => s.gridLayout);
  const columns = columnCount(layout, window.innerWidth - GRID_MARGIN);
  if (layout === 'mosaic') {
    return (
      <div className="wp-skeleton wp-skeleton--mosaic" aria-hidden="true">
        {Array.from({ length: columns }, (_, column) => (
          <div key={column} className="wp-skeleton__column">
            {Array.from({ length: Math.max(2, Math.ceil(count / columns)) }, (_, row) => (
              <span
                key={row}
                className="wp-skeleton__cell"
                style={{ aspectRatio: `1 / ${SKELETON_RATIOS[(column * 2 + row * 3) % SKELETON_RATIOS.length]}` }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="wp-skeleton" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="wp-skeleton__cell" />
      ))}
    </div>
  );
}
