// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EN } from '@/shared/i18n/en';
import { setLanguage } from '@/shared/i18n';
import { nativeErrorMessage, translateNativeMessage } from './index';

afterEach(() => setLanguage('fr'));

// Vitest s'exécute à la racine du projet.
const KOTLIN_DIR = join(process.cwd(), 'android/app/src/main/java');

function kotlinFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) kotlinFiles(path, out);
    else if (entry.name.endsWith('.kt')) out.push(path);
  }
  return out;
}

/** Messages d'erreur écrits en dur dans le natif : `call.reject("…")`, `WallpaperException("CODE", "…")`, repli `?: "…"`. */
function nativeMessages(): string[] {
  const source = kotlinFiles(KOTLIN_DIR)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  const found = new Set<string>();
  for (const match of source.matchAll(/call\.reject\(\s*"((?:\\.|[^"\\])*)"/g)) found.add(match[1] ?? '');
  for (const match of source.matchAll(/WallpaperException\(\s*[A-Za-z_"]+\s*,\s*"((?:\\.|[^"\\])*)"/g)) found.add(match[1] ?? '');
  for (const match of source.matchAll(/\?: "((?:\\.|[^"\\])*)", "[A-Z_]+"/g)) found.add(match[1] ?? '');
  return [...found];
}

describe('messages d’erreur du natif', () => {
  it('restent tels quels en français', () => {
    expect(nativeErrorMessage({ message: 'Image introuvable', code: 'NOT_FOUND' })).toBe('Image introuvable');
    expect(nativeErrorMessage({ message: 'Téléchargement impossible (HTTP 404)' })).toBe('Téléchargement impossible (HTTP 404)');
    expect(nativeErrorMessage(42)).toBe('Une erreur inattendue est survenue');
  });

  it('se traduisent en anglais : phrases fixes', () => {
    setLanguage('en');
    expect(nativeErrorMessage({ message: 'Image introuvable', code: 'NOT_FOUND' })).toBe('Image not found');
    expect(nativeErrorMessage({ message: 'Active la localisation de l\'appareil' })).toBe('Turn on location on your device');
    expect(nativeErrorMessage({ message: 'Choisis d’abord une vidéo' })).toBe('Choose a video first');
    expect(nativeErrorMessage(42)).toBe('An unexpected error occurred');
  });

  it('se traduisent en anglais : messages dont une valeur varie', () => {
    setLanguage('en');
    expect(translateNativeMessage('Téléchargement impossible (HTTP 503)')).toBe('Download failed (HTTP 503)');
    expect(translateNativeMessage('Impossible de créer le dossier Images/Prisme')).toBe('Couldn\'t create the Images/Prisme folder');
    expect(translateNativeMessage('Cette vidéo pèse 412 Mo : la limite est de 300 Mo.')).toBe('This video is 412 MB: the limit is 300 MB.');
    expect(translateNativeMessage('Ce GIF dépasse la limite de 50 Mo.')).toBe('This GIF exceeds the 50 MB limit.');
    expect(translateNativeMessage('Scan impossible : erreur inconnue')).toBe('Scan failed: unknown error');
    expect(translateNativeMessage('Scan impossible : Module unavailable')).toBe('Scan failed: Module unavailable');
  });

  it('laissent passer un message inconnu (déjà traduit ou venu du système)', () => {
    setLanguage('en');
    expect(translateNativeMessage('Permission denied')).toBe('Permission denied');
    expect(translateNativeMessage('java.io.IOException: boom')).toBe('java.io.IOException: boom');
  });

  it('sont tous traduits : chaque message écrit dans le code natif a son anglais', () => {
    // Les messages à valeurs variables (« … $code ») sont couverts par des motifs, essayés ci-dessus.
    const missing = nativeMessages()
      .filter((message) => !message.includes('$'))
      .map((message) => message.replaceAll('\\"', '"'))
      .filter((message) => !(message in EN));
    expect(missing).toEqual([]);
  });
});
