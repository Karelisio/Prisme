import { useMemo } from 'react';
import { t } from '@/shared/i18n';
import { QR_MARGIN, makeQr } from './qr';
import './library.css';

/** QR code d'un texte, noir sur blanc quel que soit le thème (les scanners ont besoin du contraste). */
export function QrView({ text, label = t('QR code de la collection') }: { text: string; label?: string }) {
  const qr = useMemo(() => makeQr(text), [text]);
  if (!qr) return <p className="share__note">{t('Cette collection est trop grande pour un QR code : partage le lien ou le code.')}</p>;
  const side = qr.size + QR_MARGIN * 2;
  return (
    <svg className="qr" viewBox={`${-QR_MARGIN} ${-QR_MARGIN} ${side} ${side}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x={-QR_MARGIN} y={-QR_MARGIN} width={side} height={side} fill="#ffffff" />
      <path d={qr.path} fill="#000000" />
    </svg>
  );
}
