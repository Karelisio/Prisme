import { useMemo, useRef, useState } from 'react';
import { goBack } from '@/app/navigation';
import { FeedView } from '@/features/browse/FeedView';
import '@/features/browse/browse.css';
import { useThumbSrc } from '@/features/library/useImageSrc';
import { DEFAULT_FILTERS, type Wallpaper } from '@/features/sources/types';
import { EmptyState, IconButton, SegmentedButtons } from '@/shared/ui/components';
import { keywordsOf } from './keywords';
import { similarColorSpec, similarSubjectSpec } from './similar';
import './discover.css';

type Mode = 'subject' | 'color';

/** « Plus comme ça » : fonds du même sujet ou de la même couleur que celui de l'aperçu. */
export function SimilarScreen({ wallpaper }: { wallpaper: Wallpaper }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const subject = useMemo(() => similarSubjectSpec(wallpaper), [wallpaper]);
  const color = useMemo(() => similarColorSpec(wallpaper), [wallpaper]);
  const [mode, setMode] = useState<Mode>(subject ? 'subject' : 'color');
  const thumb = useThumbSrc(wallpaper);
  const spec = mode === 'subject' ? subject : color;
  const keywords = keywordsOf(wallpaper);
  const options = useMemo(() => ({ filters: DEFAULT_FILTERS, exclude: (w: Wallpaper) => w.id === wallpaper.id }), [wallpaper.id]);

  const modes = [
    ...(subject ? [{ value: 'subject' as const, label: 'Même sujet', icon: 'label' as const }] : []),
    ...(color ? [{ value: 'color' as const, label: 'Même couleur', icon: 'palette' as const }] : []),
  ];

  return (
    <div ref={scrollRef} className="screen overlay-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">Plus comme ça</h1>
      </header>
      <div className="similar-head">
        <img className="similar-head__thumb" src={thumb} alt="" style={{ backgroundColor: wallpaper.color }} />
        <p className="similar-head__text">
          {mode === 'subject'
            ? keywords.length > 0
              ? `Sujet : ${keywords.join(', ')}`
              : 'Fonds aux étiquettes proches'
            : 'Fonds de la même teinte dominante'}
        </p>
      </div>
      {modes.length > 1 && (
        <div className="similar-modes">
          <SegmentedButtons label="Rapprocher par" options={modes} value={mode} onChange={setMode} />
        </div>
      )}
      {spec ? (
        <FeedView key={spec.key} spec={spec} scrollRef={scrollRef} options={options} emptyText="Rien de proche pour l’instant." />
      ) : (
        <EmptyState icon="imageSearch" title="Pas de fonds similaires" text="Ce fond ne donne ni sujet ni couleur à rapprocher." />
      )}
    </div>
  );
}
