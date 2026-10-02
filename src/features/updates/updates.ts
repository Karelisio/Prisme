import { getJson } from '@/shared/lib/http';

/** Dernière release publiée par le workflow Android (APK signé joint). */
export const RELEASES_URL = 'https://api.github.com/repos/Karelisio/Prisme/releases/latest';
export const CHECK_INTERVAL_MS = 6 * 3_600_000;

export interface ReleaseInfo {
  /** Version lisible, ex. « 0.2.0 ». */
  version: string;
  /** Numéro de build CI = versionCode Android. */
  build: number;
  tag: string;
  notes: string;
  apkUrl: string;
  size: number;
  pageUrl: string;
  publishedAt: string;
}

const APK_NAME = /^Prisme-(\d+\.\d+\.\d+)\.(\d+)\.apk$/;

/** « Prisme-0.2.0.31.apk » → version 0.2.0, build 31. */
export function parseApkName(name: string): { version: string; build: number } | null {
  const match = APK_NAME.exec(name);
  if (!match?.[1] || !match[2]) return null;
  return { version: match[1], build: Number.parseInt(match[2], 10) };
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Lit la réponse de l'API GitHub ; garde l'APK au plus grand numéro de build. */
export function readRelease(data: unknown): ReleaseInfo | null {
  if (!data || typeof data !== 'object') return null;
  const release = data as Record<string, unknown>;
  if (release.draft === true || release.prerelease === true) return null;
  let best: ReleaseInfo | null = null;
  for (const asset of Array.isArray(release.assets) ? release.assets : []) {
    if (!asset || typeof asset !== 'object') continue;
    const { name, browser_download_url: url, size } = asset as Record<string, unknown>;
    const parsed = typeof name === 'string' ? parseApkName(name) : null;
    if (!parsed || typeof url !== 'string' || !url.startsWith('https://')) continue;
    if (best && best.build >= parsed.build) continue;
    best = {
      ...parsed,
      tag: text(release.tag_name),
      notes: text(release.body).trim(),
      apkUrl: url,
      size: typeof size === 'number' ? size : 0,
      pageUrl: text(release.html_url),
      publishedAt: text(release.published_at),
    };
  }
  return best;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const res = await getJson<unknown>(RELEASES_URL, { Accept: 'application/vnd.github+json' });
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`GitHub a répondu ${res.status}`);
  return readRelease(res.data);
}

export type NoteBlock = { kind: 'heading' | 'item' | 'text'; text: string };

/** Notes de version (Markdown simple) découpées en titres, puces et paragraphes. */
export function parseNotes(notes: string): NoteBlock[] {
  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): NoteBlock => {
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (heading?.[1]) return { kind: 'heading', text: heading[1] };
      const item = /^[-*]\s+(.*)$/.exec(line);
      if (item?.[1]) return { kind: 'item', text: item[1] };
      return { kind: 'text', text: line };
    })
    .map((block) => ({ ...block, text: block.text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1') }));
}
