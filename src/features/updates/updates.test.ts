import { describe, expect, it } from 'vitest';
import { parseApkName, parseNotes, readRelease } from './updates';

const release = (assets: unknown[], extra: Record<string, unknown> = {}) => ({
  tag_name: 'v0.2.0',
  body: '## Nouveautés\n- **Tuile** « Fond suivant »\n- `HD` en Wi-Fi\n\nMerci !',
  html_url: 'https://github.com/Karelisio/Prisme/releases/tag/v0.2.0',
  published_at: '2026-10-02T08:00:00Z',
  assets,
  ...extra,
});

const asset = (name: string, url = `https://github.com/Karelisio/Prisme/releases/download/v0.2.0/${name}`) => ({
  name,
  browser_download_url: url,
  size: 3_900_000,
});

describe('mises à jour', () => {
  it('lit le nom des APK publiés par la CI', () => {
    expect(parseApkName('Prisme-0.2.0.31.apk')).toEqual({ version: '0.2.0', build: 31 });
    expect(parseApkName('Prisme-0.2.0.apk')).toBeNull();
    expect(parseApkName('autre-0.2.0.31.apk')).toBeNull();
  });

  it('retient l’APK au plus grand numéro de build', () => {
    const info = readRelease(release([asset('notes.txt'), asset('Prisme-0.2.0.31.apk'), asset('Prisme-0.2.0.33.apk')]));
    expect(info).toMatchObject({ version: '0.2.0', build: 33, tag: 'v0.2.0', size: 3_900_000 });
    expect(info?.apkUrl).toMatch(/Prisme-0\.2\.0\.33\.apk$/);
  });

  it('ignore brouillons, préversions, liens non https et réponses inattendues', () => {
    expect(readRelease(release([asset('Prisme-0.2.0.31.apk')], { draft: true }))).toBeNull();
    expect(readRelease(release([asset('Prisme-0.2.0.31.apk')], { prerelease: true }))).toBeNull();
    expect(readRelease(release([asset('Prisme-0.2.0.31.apk', 'http://exemple.com/x.apk')]))).toBeNull();
    expect(readRelease(release([]))).toBeNull();
    expect(readRelease('erreur')).toBeNull();
    expect(readRelease(null)).toBeNull();
  });

  it('met en forme les notes de version', () => {
    expect(parseNotes('## Nouveautés\n- **Tuile** « Fond suivant »\n- `HD` en Wi-Fi\n\nMerci !')).toEqual([
      { kind: 'heading', text: 'Nouveautés' },
      { kind: 'item', text: 'Tuile « Fond suivant »' },
      { kind: 'item', text: 'HD en Wi-Fi' },
      { kind: 'text', text: 'Merci !' },
    ]);
    expect(parseNotes('')).toEqual([]);
  });
});
