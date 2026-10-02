import { describe, expect, it } from 'vitest';
import { collapsedFrame } from './transitions';

describe('animation FLIP de l’élément partagé', () => {
  // Scène de l'aperçu (ratio d'écran 9:18) centrée dans une fenêtre de 412 × 915 ; miniature 9:16 de la grille.
  const stage = { x: 6, y: 57.5, width: 400, height: 800 };
  const thumb = { x: 20, y: 100, width: 180, height: 320 };

  it('replie la scène sur la miniature sans déformer l’image', () => {
    const frame = collapsedFrame(stage, thumb, 12)!;
    expect(frame).not.toBeNull();
    // Échelle uniforme, au moins celle qui couvre la miniature dans les deux sens.
    expect(frame.scale).toBeCloseTo(0.45, 6);
    expect(frame.scale).toBeGreaterThanOrEqual(thumb.width / stage.width);
    expect(frame.scale).toBeGreaterThanOrEqual(thumb.height / stage.height);
  });

  it('centre la scène sur la miniature et rogne exactement à son format', () => {
    const frame = collapsedFrame(stage, thumb, 12)!;
    // Les centres coïncident une fois la translation appliquée.
    expect(stage.x + stage.width / 2 + frame.dx).toBeCloseTo(thumb.x + thumb.width / 2, 6);
    expect(stage.y + stage.height / 2 + frame.dy).toBeCloseTo(thumb.y + thumb.height / 2, 6);
    // La partie visible (scène moins les rognages), mise à l'échelle, a la taille de la miniature.
    expect((stage.width - 2 * frame.insetX) * frame.scale).toBeCloseTo(thumb.width, 6);
    expect((stage.height - 2 * frame.insetY) * frame.scale).toBeCloseTo(thumb.height, 6);
    expect(frame.insetX).toBeGreaterThanOrEqual(0);
    expect(frame.insetY).toBeGreaterThanOrEqual(0);
    // Les coins arrondis de la miniature, ramenés dans le repère de la scène.
    expect(frame.radius).toBeCloseTo(12 / frame.scale, 6);
  });

  it('couvre la miniature aussi quand elle est plus large que la scène', () => {
    const wide = { x: 0, y: 0, width: 300, height: 120 };
    const frame = collapsedFrame(stage, wide)!;
    expect(frame.scale).toBeCloseTo(0.75, 6); // la largeur impose l'échelle, la hauteur est rognée
    expect(frame.insetX).toBeCloseTo(0, 6);
    expect((stage.height - 2 * frame.insetY) * frame.scale).toBeCloseTo(wide.height, 6);
  });

  it('ne produit rien pour une boîte vide', () => {
    expect(collapsedFrame({ ...stage, width: 0 }, thumb)).toBeNull();
    expect(collapsedFrame(stage, { ...thumb, height: 0 })).toBeNull();
  });
});
