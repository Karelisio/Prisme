let tile: HTMLCanvasElement | null = null;

/** Tuile de bruit gris 256 × 256, générée une seule fois (grain des retouches et des créations). */
export function noiseTile(): HTMLCanvasElement {
  if (tile) return tile;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const data = ctx.createImageData(256, 256);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.random() * 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  tile = canvas;
  return canvas;
}

/** Superpose du grain ; même aspect à toutes les tailles de rendu. */
export function drawGrain(ctx: CanvasRenderingContext2D, amount: number, width: number, height: number) {
  if (amount <= 0) return;
  const pattern = ctx.createPattern(noiseTile(), 'repeat');
  if (!pattern) return;
  pattern.setTransform(new DOMMatrix().scale(Math.max(1, width / 1080)));
  ctx.save();
  ctx.globalAlpha = amount * 0.45;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
