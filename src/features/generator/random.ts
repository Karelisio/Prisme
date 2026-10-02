/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix32(h: number, v: number): number {
  let x = Math.imul(h ^ (v | 0), 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return x ^ (x >>> 16);
}

/**
 * Hachage entier de (graine, i, j, sel) vers [0, 1[ : la valeur d'une cellule du motif ne dépend
 * ni de l'ordre de parcours ni de la taille de rendu, donc l'aperçu et l'export coïncident.
 */
export function cellRandom(seed: number, i: number, j: number, salt = 0): number {
  return (mix32(mix32(mix32(mix32(0x9e3779b9, seed), i), j), salt) >>> 0) / 4294967296;
}

/** Copie mélangée (Fisher-Yates) avec un générateur fourni, donc reproductible. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
