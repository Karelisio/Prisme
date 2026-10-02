import qrcode from 'qrcode-generator';

/** QR code prêt à dessiner : une seule forme SVG (modules sombres) dans une grille `size` × `size`. */
export interface QrCode {
  /** Modules par côté, sans la marge. */
  size: number;
  /** Données de tracé (`d`) : un carré de 1 par module sombre, regroupés par séquences horizontales. */
  path: string;
  /** Niveau de correction d'erreurs retenu : « M » (~15 %), ou « L » (~7 %) quand le contenu est long. */
  level: 'M' | 'L';
}

/** Marge claire autour du code (4 modules, comme l'exige la norme). */
export const QR_MARGIN = 4;

/**
 * Génère le QR code d'un texte (ASCII). Renvoie null quand il est trop long pour entrer dans la
 * plus grande version (40, soit environ 2 900 caractères en correction « L »).
 */
export function makeQr(text: string): QrCode | null {
  for (const level of ['M', 'L'] as const) {
    try {
      const qr = qrcode(0, level);
      qr.addData(text);
      qr.make();
      return { size: qr.getModuleCount(), path: modulesPath(qr.getModuleCount(), (row, col) => qr.isDark(row, col)), level };
    } catch {
      // Contenu trop long pour ce niveau : on essaie avec moins de redondance.
    }
  }
  return null;
}

/** Tracé SVG des modules sombres : une séquence horizontale par `h`, un trait de 1 de haut. */
export function modulesPath(size: number, isDark: (row: number, col: number) => boolean): string {
  const parts: string[] = [];
  for (let row = 0; row < size; row++) {
    let col = 0;
    while (col < size) {
      if (!isDark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < size && isDark(row, col)) col++;
      parts.push(`M${start} ${row}h${col - start}v1h-${col - start}z`);
    }
  }
  return parts.join('');
}
