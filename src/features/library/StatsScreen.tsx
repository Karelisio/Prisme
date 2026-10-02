import { type ReactNode, useEffect, useMemo } from 'react';
import { goBack, openPreview } from '@/app/navigation';
import { importAutomationLog } from '@/features/automation/sync';
import { sourceLabel } from '@/features/sources/registry';
import type { Wallpaper } from '@/features/sources/types';
import { EmptyState, IconButton } from '@/shared/ui/components';
import { HISTORY_LIMIT } from './model';
import { type Usage, computeStats, formatDuration, longestShown } from './stats';
import { useLibrary } from './store';
import { useThumbSrc } from './useImageSrc';
import './library.css';

/** Nombre de fonds listés dans chaque classement. */
const TOP = 5;

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Ligne de classement : libellé, barre horizontale proportionnelle (`ratio` de 0 à 1) et valeur. */
function StatRow({
  leading,
  label,
  detail,
  value,
  ratio,
  onClick,
}: {
  leading?: ReactNode;
  label: string;
  detail?: string;
  value: string;
  ratio: number;
  onClick?: () => void;
}) {
  const content = (
    <>
      {leading}
      <span className="stat-row__body">
        <span className="stat-row__label">{label}</span>
        <span className="bar" aria-hidden="true">
          {/* Une trace minimale reste visible pour les petites valeurs. */}
          <span className="bar__fill" style={{ width: `${Math.max(3, Math.round(ratio * 100))}%` }} />
        </span>
        {detail && <span className="stat-row__detail">{detail}</span>}
      </span>
      <span className="stat-row__value">{value}</span>
    </>
  );
  return (
    <li>
      {onClick ? (
        <button type="button" className="stat-row state" onClick={onClick}>
          {content}
        </button>
      ) : (
        <div className="stat-row">{content}</div>
      )}
    </li>
  );
}

function Thumb({ wallpaper }: { wallpaper: Wallpaper }) {
  const src = useThumbSrc(wallpaper);
  return <img className="stat-row__thumb" src={src} alt="" loading="lazy" style={{ backgroundColor: wallpaper.color }} />;
}

/** Bibliothèque › Statistiques : fonds les plus appliqués, temps passé sur chacun, répartition par source. */
export function StatsScreen() {
  const history = useLibrary((s) => s.history);
  const items = useLibrary((s) => s.items);
  const stats = useMemo(() => computeStats(history, items, Date.now()), [history, items]);

  // Les fonds appliqués par les automatismes app fermée sont versés à l'historique : on les y ajoute avant de compter.
  useEffect(() => {
    if (useLibrary.getState().hydrated) void importAutomationLog();
  }, []);

  const known = (rows: Usage[]) => rows.flatMap((usage) => (items[usage.id] ? [{ usage, wallpaper: items[usage.id] as Wallpaper }] : []));
  const mostApplied = known(stats.usage).slice(0, TOP);
  const longest = known(longestShown(stats, stats.usage.length)).slice(0, TOP);
  const maxCount = Math.max(1, ...mostApplied.map((r) => r.usage.count));
  const maxMs = Math.max(1, ...longest.map((r) => r.usage.ms));
  const sourceTotal = Math.max(1, stats.bySource.reduce((sum, s) => sum + s.count, 0));

  return (
    <div className="screen overlay-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">Statistiques</h1>
      </header>
      {stats.total === 0 ? (
        <EmptyState icon="barChart" title="Pas encore de statistiques" text="Les fonds que tu appliques, à la main ou automatiquement, seront comptés ici." />
      ) : (
        <div className="stats">
          <section className="stats__summary" aria-label="Résumé">
            <p className="stats__figure">{plural(stats.total, 'application')}</p>
            <p className="stats__since">
              depuis le {new Date(stats.since ?? 0).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              {stats.auto > 0 ? `, dont ${stats.auto} automatique${stats.auto > 1 ? 's' : ''}` : ''}
            </p>
          </section>

          <section aria-labelledby="stats-top">
            <h2 id="stats-top" className="list-subheader">
              Les plus appliqués
            </h2>
            <ul className="stats__list">
              {mostApplied.map(({ usage, wallpaper }) => (
                <StatRow
                  key={usage.id}
                  leading={<Thumb wallpaper={wallpaper} />}
                  label={wallpaper.alt}
                  value={`${usage.count} fois`}
                  ratio={usage.count / maxCount}
                  onClick={() => openPreview(wallpaper)}
                />
              ))}
            </ul>
          </section>

          {longest.length > 0 && (
            <section aria-labelledby="stats-time">
              <h2 id="stats-time" className="list-subheader">
                Temps passé à l’écran
              </h2>
              <ul className="stats__list">
                {longest.map(({ usage, wallpaper }) => (
                  <StatRow
                    key={usage.id}
                    leading={<Thumb wallpaper={wallpaper} />}
                    label={wallpaper.alt}
                    value={formatDuration(usage.ms)}
                    ratio={usage.ms / maxMs}
                    onClick={() => openPreview(wallpaper)}
                  />
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="stats-source">
            <h2 id="stats-source" className="list-subheader">
              Par source
            </h2>
            <ul className="stats__list">
              {stats.bySource.map((row) => (
                <StatRow
                  key={row.source}
                  label={sourceLabel(row.source)}
                  detail={`${plural(row.count, 'application')} · ${formatDuration(row.ms)}`}
                  value={`${Math.round((row.count / sourceTotal) * 100)} %`}
                  ratio={row.count / sourceTotal}
                />
              ))}
            </ul>
          </section>

          <p className="stats__note">
            Calculé d’après l’historique ({HISTORY_LIMIT} applications au plus, automatismes compris). Un fond compte jusqu’à l’application suivante sur le même écran ; le fond
            actuel, jusqu’à maintenant.
          </p>
        </div>
      )}
    </div>
  );
}
