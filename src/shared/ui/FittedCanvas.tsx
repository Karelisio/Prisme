import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Size {
  width: number;
  height: number;
}

/** Plus grand rectangle au ratio voulu (hauteur / largeur) qui tient dans la zone disponible. */
export function fitBox(box: Size, ratio: number): Size {
  const height = Math.min(box.height, box.width * ratio);
  return { width: height / ratio, height };
}

/**
 * Canvas d'aperçu au ratio de l'écran, dimensionné d'après la place disponible et redessiné
 * (à la résolution d'affichage seulement) quand `draw` change.
 */
export function FittedCanvas({
  ratio,
  draw,
  label,
  className,
}: {
  ratio: number;
  draw: ((ctx: CanvasRenderingContext2D, width: number, height: number) => void) | null;
  label: string;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState<Size | null>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const display = box ? fitBox(box, ratio) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !display || !draw) return;
    const frame = requestAnimationFrame(() => {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.round(display.width * scale);
      const height = Math.round(display.height * scale);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) draw(ctx, width, height);
    });
    return () => cancelAnimationFrame(frame);
  }, [draw, display?.width, display?.height]);

  return (
    <div ref={boxRef} className={className ? `fitted-canvas ${className}` : 'fitted-canvas'}>
      <canvas
        ref={canvasRef}
        aria-label={label}
        style={display ? { width: display.width, height: display.height } : { visibility: 'hidden' }}
      />
    </div>
  );
}
