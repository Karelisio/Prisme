import { memo } from 'react';
import { type LayoutId, layoutCells } from './layouts';

const WIDTH = 30;

/** Vignette schématique d'une disposition, au ratio de l'écran ; la couleur suit `currentColor`. */
export const LayoutThumb = memo(function LayoutThumb({ id, ratio }: { id: LayoutId; ratio: number }) {
  const height = Math.round(WIDTH * ratio);
  const cells = layoutCells(id, WIDTH, height, { gap: 2, radius: 2 });
  return (
    <svg className="layout-thumb" viewBox={`0 0 ${WIDTH} ${height}`} width={WIDTH} height={height} aria-hidden="true" focusable="false">
      <rect className="layout-thumb__frame" x={0.4} y={0.4} width={WIDTH - 0.8} height={height - 0.8} rx={4} />
      {cells.map((cell, i) => {
        const transform = `translate(${cell.cx.toFixed(2)} ${cell.cy.toFixed(2)}) rotate(${((cell.rotation * 180) / Math.PI).toFixed(2)})`;
        if (!cell.framed) {
          return <rect key={i} className="layout-thumb__cell" x={-cell.width / 2} y={-cell.height / 2} width={cell.width} height={cell.height} rx={cell.radius} transform={transform} />;
        }
        const left = -cell.width / 2 + cell.inset.left;
        const top = -cell.height / 2 + cell.inset.top;
        return (
          <g key={i} transform={transform}>
            <rect className="layout-thumb__card" x={-cell.width / 2} y={-cell.height / 2} width={cell.width} height={cell.height} rx={1} />
            <rect className="layout-thumb__cell" x={left} y={top} width={cell.width - cell.inset.left - cell.inset.right} height={cell.height - cell.inset.top - cell.inset.bottom} />
          </g>
        );
      })}
    </svg>
  );
});
