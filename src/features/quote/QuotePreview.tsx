import { useEffect, useRef } from 'react';
import type { NativeQuote } from '@/shared/native/quote';
import type { QuoteScreen, QuoteStyle } from './layout';
import { type PreviewBackground, drawQuotePreview } from './render';

/** Largeur de tracé du canevas : les proportions suivent l'écran, seule la netteté dépend de ce nombre. */
const CANVAS_WIDTH = 540;

/** Aperçu fidèle : la phrase dessinée comme le natif la posera, sur un fond d'exemple au format de l'écran. */
export function QuotePreview({
  quote,
  style,
  screen,
  background,
  ratio,
}: {
  quote: NativeQuote | null;
  style: QuoteStyle;
  screen: QuoteScreen;
  background: PreviewBackground;
  /** Hauteur / largeur de l'écran. */
  ratio: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const aspect = Math.min(Math.max(ratio, 1.6), 2.6);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !quote) return;
    drawQuotePreview(element, { quote, style, screen, background, width: CANVAS_WIDTH, height: Math.round(CANVAS_WIDTH * aspect) });
  }, [quote, style, screen, background, aspect]);

  return (
    <div className="quote-preview" style={{ aspectRatio: `1 / ${aspect}` }} data-screen={screen}>
      <canvas ref={canvas} className="quote-preview__canvas" role="img" aria-label={`Aperçu de la phrase sur l’écran ${screen === 'lock' ? 'de verrouillage' : 'd’accueil'}`} />
      {screen === 'lock' ? (
        <div className="quote-preview__clock" aria-hidden="true">
          09:41
        </div>
      ) : (
        <div className="quote-preview__dock" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  );
}
