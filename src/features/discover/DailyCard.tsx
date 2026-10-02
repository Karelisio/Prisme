import { openPreview } from '@/app/navigation';
import { usePreviewSrc } from '@/features/library/useImageSrc';
import { sourceLabel } from '@/features/sources/registry';
import type { Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import { Icon } from '@/shared/ui/components';
import { useDaily } from './dailyActions';
import './discover.css';

/** Carte « Fond du jour » en tête d'« À la une ». */
export function DailyCard() {
  const { wallpaper, loading } = useDaily();
  if (wallpaper) return <DailyCardContent wallpaper={wallpaper} />;
  return loading ? <div className="daily-card daily-card--loading" aria-hidden="true" /> : null;
}

function DailyCardContent({ wallpaper }: { wallpaper: Wallpaper }) {
  const src = usePreviewSrc(wallpaper);
  const credit = [wallpaper.author?.name, sourceLabel(wallpaper.source)].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      className="daily-card"
      style={{ backgroundColor: wallpaper.color }}
      onClick={() => openPreview(wallpaper)}
      aria-label={t('Fond du jour : {alt}', { alt: wallpaper.alt })}
    >
      <img src={src} alt="" decoding="async" draggable={false} onLoad={(e) => e.currentTarget.classList.add('is-loaded')} />
      <span className="daily-card__label">
        <Icon name="today" size={18} />
        {t('Fond du jour')}
      </span>
      <span className="daily-card__text">
        <span className="daily-card__title">{wallpaper.alt}</span>
        <span className="daily-card__credit">{credit}</span>
      </span>
    </button>
  );
}
