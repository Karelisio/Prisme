import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHELL } from './shell';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** Dossiers de l'app dont les textes sont traduits par cette table (coquille, réglages, Explorer, aperçu, sources…). */
const SHELL_DIRS = [
  'src/app',
  'src/shared',
  'src/features/settings',
  'src/features/onboarding',
  'src/features/browse',
  'src/features/preview',
  'src/features/sources',
  'src/features/discover',
  'src/features/packs',
  'src/features/updates',
  'src/features/backup',
  'src/features/diagnostics',
  'src/features/palette',
  'src/features/linked',
];

/** Textes passés à `t()` qui s'écrivent pareil en anglais : pas d'entrée dans la table. */
const SAME_IN_ENGLISH = new Set([
  'Introduction',
  'Collage',
  'Packs',
  'Pack',
  'Simulation',
  'AMOLED',
  'Source',
  'Sources',
  'Photos',
  'Interface',
  'Cache',
  'Mode',
  'Version {version} · {status}',
  '{count} collection',
  '{count} collections',
]);

function files(dir: string, accept: (name: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') files(path, accept, out);
    } else if (accept(entry.name)) out.push(path);
  }
  return out;
}

const isCode = (name: string) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name);
const read = (paths: string[]) => paths.map((path) => readFileSync(path, 'utf8')).join('\n');

/** Code de l'app (hors tables de traduction et tests), code natif Android (messages d'erreur) et manifeste des packs. */
function codeCorpus(): string {
  const app = files(join(ROOT, 'src'), isCode).filter((path) => !path.includes(`${join('shared', 'i18n', 'en')}`));
  const native = files(join(ROOT, 'android/app/src/main/java'), (name) => name.endsWith('.kt'));
  return read([...app, ...native, join(ROOT, 'packs/packs.json')]);
}

/** Écritures possibles d'un texte comme littéral de chaîne (guillemets simples, doubles ou accent grave). */
function literalForms(text: string): string[] {
  return ["'", '"', '`'].map((quote) => {
    const escaped = text.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(quote, `\\${quote}`);
    return `${quote}${escaped}${quote}`;
  });
}

const unescapeLiteral = (text: string) => text.replace(/\\(.)/g, (_, char: string) => (char === 'n' ? '\n' : char));

/** Textes français passés à `t('…')` et `tn(n, '…', '…')` dans le code (littéraux uniquement). */
function translatedTexts(source: string): string[] {
  const literal = String.raw`(['"\`])((?:\\.|(?!\1)[^\\\n])*)\1`;
  const out: string[] = [];
  for (const match of source.matchAll(new RegExp(String.raw`(?<![\w.$])t\(\s*${literal}`, 'g'))) out.push(match[2] ?? '');
  const plural = new RegExp(String.raw`(?<![\w.$])tn\(\s*[^,()]+,\s*(['"\`])((?:\\.|(?!\1)[^\\\n])*)\1\s*,\s*(['"\`])((?:\\.|(?!\3)[^\\\n])*)\3`, 'g');
  for (const match of source.matchAll(plural)) out.push(match[2] ?? '', match[4] ?? '');
  return out.map(unescapeLiteral);
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('table anglaise : coquille, réglages, explorer, aperçu', () => {
  const entries = Object.entries(SHELL);

  it('ne contient aucun doublon (une entrée par ligne, autant que de clés)', () => {
    const source = readFileSync(join(ROOT, 'src/shared/i18n/en/shell.ts'), 'utf8');
    const declared = source.split('\n').filter((line) => /^ {2}['"]/.test(line));
    expect(declared.length).toBe(entries.length);
  });

  it('ne garde aucune clé morte : chaque clé est un texte du code (app, natif Android ou packs)', () => {
    const corpus = codeCorpus();
    const dead = entries.map(([key]) => key).filter((key) => !literalForms(key).some((form) => corpus.includes(form)));
    expect(dead).toEqual([]);
  });

  it('traduit vraiment : texte différent du français, sans espace en trop, mêmes variables', () => {
    for (const [fr, en] of entries) {
      expect(en, fr).not.toBe(fr);
      expect(en.trim(), fr).toBe(en);
      expect(fr.trim(), fr).toBe(fr);
      expect(placeholders(en), fr).toEqual(placeholders(fr));
    }
  });

  it('couvre tous les textes passés à t() ou tn() dans ses dossiers', () => {
    const missing = new Set<string>();
    for (const dir of SHELL_DIRS) {
      // Le mécanisme lui-même (src/shared/i18n) cite des exemples dans ses commentaires.
      for (const path of files(join(ROOT, dir), isCode).filter((file) => !file.includes(join('shared', 'i18n')))) {
        for (const text of translatedTexts(readFileSync(path, 'utf8'))) {
          if (!(text in SHELL) && !SAME_IN_ENGLISH.has(text)) missing.add(`${path.replace(ROOT, '')} : ${text}`);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });
});
