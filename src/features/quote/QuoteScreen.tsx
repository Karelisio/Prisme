import { useMemo, useState } from 'react';
import { goBack } from '@/app/navigation';
import { TargetChips } from '@/features/automation/components';
import { useSettings } from '@/features/settings/store';
import { useScreenInfo, screenRatio } from '@/shared/lib/screen';
import { Button, Chip, Icon, IconButton, SegmentedButtons, Switch } from '@/shared/ui/components';
import type { QuoteScreen as ScreenKind, QuoteStyle } from './layout';
import { MyQuotes } from './MyQuotes';
import {
  COLOR_CHOICES,
  FONT_CHOICES,
  POSITION_CHOICES,
  QUOTE_STATUS,
  SIZE_CHOICES,
  SOURCE_CHOICES,
  activeQuotes,
  quoteOfTheDay,
  quoteStatusKind,
} from './model';
import { QuotePreview } from './QuotePreview';
import { PREVIEW_BACKGROUNDS, type PreviewBackground } from './render';
import { useQuotePrefs } from './store';
import { useQuoteStatus } from './useQuoteStatus';
import '@/features/automation/automation.css';
import './quote.css';

/** Groupe de puces à choix unique. */
function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="option-block">
      <h2 className="option-block__title">{label}</h2>
      <div className="chip-wrap" role="group" aria-label={label}>
        {options.map((option) => (
          <Chip key={option.value} selected={value === option.value} onClick={() => onChange(option.value)}>
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** Options avancées › Citation du jour. */
export function QuoteScreen() {
  const enabled = useSettings((s) => s.features.quote);
  const setFeature = useSettings((s) => s.setFeature);
  const { target, source, font, position, size, color, shift, custom } = useQuotePrefs();
  const update = useQuotePrefs((s) => s.update);
  const another = useQuotePrefs((s) => s.another);
  const status = useQuoteStatus();
  const screenInfo = useScreenInfo();
  const [previewScreen, setPreviewScreen] = useState<ScreenKind>('lock');
  const [background, setBackground] = useState<PreviewBackground>('night');

  const list = useMemo(() => activeQuotes(source, custom), [source, custom]);
  const today = quoteOfTheDay(list, new Date(), shift);
  const style = useMemo<QuoteStyle>(() => ({ font, position, size, color }), [font, position, size, color]);
  // Une seule cible : l'aperçu la suit ; « les deux » laisse choisir l'écran regardé.
  const shown: ScreenKind = target === 'both' ? previewScreen : target;
  const kind = status ? quoteStatusKind(status, enabled, target) : null;
  const noCustom = source === 'mine' && custom.length === 0;

  return (
    <div className="screen overlay-screen option-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">Citation du jour</h1>
        <Switch label="Activer la citation du jour" checked={enabled} onChange={(v) => setFeature('quote', v)} />
      </header>
      <p className="option-intro">
        Une phrase posée sur ton fond d’écran, renouvelée chaque matin vers 6 h, même app fermée. Elle s’ajoute aux fonds que Prisme
        applique : l’image d’origine est gardée intacte, et le voile du soir se pose par-dessus.
      </p>

      {kind && (
        <div className="option-status" role="status">
          <Icon name={QUOTE_STATUS[kind].icon} />
          {QUOTE_STATUS[kind].text}
        </div>
      )}

      <div className="quote-stage">
        <QuotePreview quote={today} style={style} screen={shown} background={background} ratio={screenRatio(screenInfo)} />
        {target === 'both' && (
          <SegmentedButtons
            label="Aperçu sur"
            options={[
              { value: 'lock', label: 'Verrouillage' },
              { value: 'home', label: 'Accueil' },
            ]}
            value={previewScreen}
            onChange={setPreviewScreen}
          />
        )}
        <div className="chip-wrap quote-stage__backgrounds" role="group" aria-label="Fond de l’aperçu">
          {PREVIEW_BACKGROUNDS.map((choice) => (
            <Chip key={choice.value} selected={background === choice.value} onClick={() => setBackground(choice.value)}>
              {choice.label}
            </Chip>
          ))}
        </div>
        {today && (
          <figure className="quote-today" aria-label="Phrase du jour">
            <blockquote>{today.text}</blockquote>
            {today.author && <figcaption>— {today.author}</figcaption>}
          </figure>
        )}
        <Button variant="tonal" icon="shuffle" onClick={another} disabled={list.length < 2}>
          Une autre
        </Button>
      </div>

      <div className="option-block">
        <h2 className="option-block__title">Écran</h2>
        <TargetChips value={target} onChange={(t) => update({ target: t })} />
      </div>

      <div className="option-block">
        <h2 className="option-block__title">Source</h2>
        <SegmentedButtons label="Source" options={SOURCE_CHOICES} value={source} onChange={(v) => update({ source: v })} />
        {noCustom && <p className="option-hint">Aucune citation perso pour l’instant : les proverbes sont utilisés.</p>}
      </div>

      <Choice label="Police" options={FONT_CHOICES} value={font} onChange={(v) => update({ font: v })} />
      <Choice label="Position" options={POSITION_CHOICES} value={position} onChange={(v) => update({ position: v })} />
      <Choice label="Taille" options={SIZE_CHOICES} value={size} onChange={(v) => update({ size: v })} />
      <Choice label="Couleur" options={COLOR_CHOICES} value={color} onChange={(v) => update({ color: v })} />
      <p className="option-hint option-hint--padded">
        En automatique, le texte est blanc ou noir selon la luminosité du fond à l’endroit où il se pose, avec un voile léger et une
        ombre pour rester lisible. Au verrouillage, « Haut » se place sous l’horloge.
      </p>

      <MyQuotes />
    </div>
  );
}
