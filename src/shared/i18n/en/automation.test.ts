import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AUTOMATION } from './automation';

/** Dossier `src`. */
const SRC = fileURLToPath(new URL('../../../', import.meta.url));
/** Les tables de traduction elles-mêmes ne comptent pas comme « du code ». */
const TABLES = join(SRC, 'shared', 'i18n', 'en');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path === TABLES ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const CODE = sources(SRC)
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

/** Le texte figure dans le code comme chaîne entre guillemets, apostrophes ou accents graves. */
function quoted(text: string): boolean {
  return (
    CODE.includes(`'${text.replaceAll("'", "\\'")}'`) || CODE.includes(`"${text.replaceAll('"', '\\"')}"`) || CODE.includes(`\`${text}\``)
  );
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Dossiers dont cette table donne les traductions anglaises. */
const SCOPE = ['automation', 'live', 'music', 'generator', 'quote'].map((dir) => join(SRC, 'features', dir));

/** Textes en français écrits pareil en anglais : pas d'entrée dans la table. */
const SAME_IN_ENGLISH = new Set(['Date', 'Grain', 'Options', 'Palette', 'Palette {number}', 'Palettes', 'Position', 'Rotation', 'Source', 'Style']);

const LITERAL = String.raw`(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")`;
const unescape = (text: string | undefined) => text?.replaceAll("\\'", "'").replaceAll('\\"', '"') ?? '';

/** Textes écrits en dur dans les appels `t('…')` et `tn(n, '…', '…')` du périmètre. */
function usedTexts(): Set<string> {
  const used = new Set<string>();
  for (const file of SCOPE.flatMap(sources)) {
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(new RegExp(String.raw`(?<![\w.])t\(\s*${LITERAL}`, 'g'))) used.add(unescape(m[1] ?? m[2]));
    for (const m of code.matchAll(new RegExp(String.raw`(?<![\w.])tn\(\s*[^,]+,\s*${LITERAL}\s*,\s*${LITERAL}`, 'g'))) {
      used.add(unescape(m[1] ?? m[2]));
      used.add(unescape(m[3] ?? m[4]));
    }
  }
  return used;
}

describe('traductions anglaises : automatismes, fonds animés, musique, générateur, citation', () => {
  const entries = Object.entries(AUTOMATION);

  it('la table n’est pas vide', () => {
    expect(entries.length).toBeGreaterThan(300);
  });

  it('chaque clé existe comme texte dans le code (pas de clé morte)', () => {
    const dead = entries.map(([key]) => key).filter((key) => !quoted(key));
    expect(dead).toEqual([]);
  });

  it('chaque texte passé à t() ou tn() dans le périmètre a sa traduction (pas de traduction manquante)', () => {
    const used = usedTexts();
    expect(used.size).toBeGreaterThan(250);
    const missing = [...used].filter((text) => !(text in AUTOMATION) && !SAME_IN_ENGLISH.has(text));
    expect(missing).toEqual([]);
  });

  it('chaque traduction est renseignée et garde les mêmes variables que le texte français', () => {
    const wrong = entries.filter(([key, english]) => english.trim() === '' || placeholders(key).join() !== placeholders(english).join()).map(([key]) => key);
    expect(wrong).toEqual([]);
  });

  it('aucune traduction identique au français (ces textes n’ont pas besoin d’entrée)', () => {
    const same = entries.filter(([key, english]) => key === english).map(([key]) => key);
    expect(same).toEqual([]);
  });
});
