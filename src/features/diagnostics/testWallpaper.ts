/** Génère un fond de test (dégradé + repères) à la taille de l'écran, en data URL JPEG. */
export function renderTestWallpaper(width: number, height: number, label: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#3a1c71');
  gradient.addColorStop(0.5, '#d76d77');
  gradient.addColorStop(1, '#ffaf7b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Cadre et diagonales : permettent de vérifier visuellement le recadrage appliqué.
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = Math.max(4, width / 200);
  ctx.strokeRect(0, 0, width, height);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, height);
  ctx.moveTo(width, 0);
  ctx.lineTo(0, height);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `600 ${Math.round(width / 9)}px system-ui, sans-serif`;
  ctx.fillText('Prisme', width / 2, height * 0.42);
  ctx.font = `400 ${Math.round(width / 22)}px system-ui, sans-serif`;
  ctx.fillText(label, width / 2, height * 0.42 + width / 10);
  ctx.fillText(`${width} × ${height}`, width / 2, height * 0.42 + width / 5.5);

  return canvas.toDataURL('image/jpeg', 0.92);
}
