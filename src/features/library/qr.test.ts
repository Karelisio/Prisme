import qrcode from 'qrcode-generator';
import { describe, expect, it } from 'vitest';
import { makeQr, modulesPath } from './qr';

/** Relit les modules sombres d'un tracé produit par `modulesPath`. */
function dark(path: string): Set<string> {
  const cells = new Set<string>();
  for (const m of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(m[3]); i++) cells.add(`${Number(m[2])},${Number(m[1]) + i}`);
  }
  return cells;
}

describe('QR code', () => {
  it('regroupe les modules sombres en séquences horizontales', () => {
    const grid = ['##.', '...', '.##'];
    expect(modulesPath(3, (row, col) => grid[row]?.[col] === '#')).toBe('M0 0h2v1h-2zM1 2h2v1h-2z');
    expect(modulesPath(2, () => false)).toBe('');
    expect(modulesPath(2, () => true)).toBe('M0 0h2v1h-2zM0 1h2v1h-2z');
  });

  it('dessine exactement les modules du QR code', () => {
    const text = 'prisme://collection/eJyrVspLzE1VslIqSS0uycxLV9JRSi0qTi1RslIyNDAwB';
    const code = makeQr(text);
    expect(code).not.toBeNull();
    const reference = qrcode(0, 'M');
    reference.addData(text);
    reference.make();
    const size = reference.getModuleCount();
    expect(code?.size).toBe(size);
    expect(code?.level).toBe('M');
    const cells = dark(code?.path ?? '');
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) expect(cells.has(`${row},${col}`)).toBe(reference.isDark(row, col));
    }
  });

  it('contient les trois repères de position', () => {
    const code = makeQr('HELLO');
    expect(code?.size).toBe(21);
    const cells = dark(code?.path ?? '');
    for (const [r, c] of [
      [0, 0],
      [0, 20],
      [20, 0],
      [6, 6],
      [3, 3],
    ] as const) {
      expect(cells.has(`${r},${c}`)).toBe(true);
    }
    // Anneau clair à l'intérieur du repère, sauf dans le coin opposé (pas de repère en bas à droite).
    expect(cells.has('1,1')).toBe(false);
    expect(cells.has('1,19')).toBe(false);
  });

  it('prend moins de redondance quand le contenu est long, et renonce au-delà de la version 40', () => {
    expect(makeQr('x'.repeat(900))?.level).toBe('M');
    expect(makeQr('x'.repeat(2600))?.level).toBe('L');
    expect(makeQr('x'.repeat(3100))).toBeNull();
  });

  it('un lien de collection de taille courante reste lisible sur un écran de téléphone', () => {
    const link = `prisme://collection/${'A1b2C3d4'.repeat(75)}`;
    const code = makeQr(link);
    expect(code).not.toBeNull();
    // 620 caractères : version 20 environ (97 modules), loin de la version 40 (177).
    expect(code?.size).toBeLessThan(110);
  });
});
