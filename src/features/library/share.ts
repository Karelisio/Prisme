import { isRetrievableId } from '@/features/sources/byId';
import type { Wallpaper } from '@/features/sources/types';
import { t, tn } from '@/shared/i18n';

/**
 * Partage d'une collection sans compte : un code compact (nom + liste « source:id », en JSON
 * compressé puis en base64url) que le destinataire colle, scanne ou ouvre par un lien. Rien ne
 * transite par un serveur ; les fonds sont retrouvés chez leurs sources à partir de leur id.
 */
export const LINK_PREFIX = 'prisme://collection/';
const FORMAT_VERSION = 1;
/** Au-delà, le code serait trop long pour un lien ou un QR code, et la réception trop lente. */
export const MAX_SHARED_ITEMS = 200;
export const MAX_NAME_LENGTH = 40;
/** Garde-fous à la lecture d'un code venu de n'importe où. */
const MAX_CODE_LENGTH = 24_000;
const MAX_JSON_BYTES = 64 * 1024;
/** Nom d'une collection partagée sans nom ; en français ici, traduit à l'emploi (`t`). */
export const DEFAULT_NAME = 'Collection reçue';

/** Erreur dont le message (en français) est affichable : l'interface le traduit (`t(error.message)`). */
export class ShareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareError';
  }
}

const INVALID = new ShareError('Ce code n’est pas une collection Prisme');

export interface SharedCollection {
  name: string;
  /** Identifiants « source:id », sans doublon. */
  ids: string[];
}

/** Sépare les fonds que le destinataire pourra retrouver en ligne de ceux dont l'image reste sur ce téléphone. */
export function splitShareable<T extends Pick<Wallpaper, 'id'>>(wallpapers: readonly T[]): { shareable: T[]; excluded: T[] } {
  const shareable: T[] = [];
  const excluded: T[] = [];
  for (const w of wallpapers) (isRetrievableId(w.id) ? shareable : excluded).push(w);
  return { shareable, excluded };
}

/** Phrase expliquant pourquoi certains fonds ne partent pas avec la collection ; null s'il n'y en a pas. */
export function exclusionMessage(excluded: readonly Pick<Wallpaper, 'source'>[]): string | null {
  const n = excluded.length;
  if (n === 0) return null;
  const local = excluded.every((w) => w.source === 'device' || w.source === 'creation');
  return local
    ? tn(
        n,
        '{count} fond n’est pas inclus : importé de la galerie ou créé dans Prisme, son image reste sur ce téléphone.',
        '{count} fonds ne sont pas inclus : importés de la galerie ou créés dans Prisme, leurs images restent sur ce téléphone.',
      )
    : tn(n, '{count} fond n’est pas inclus : il ne peut pas être retrouvé en ligne.', '{count} fonds ne sont pas inclus : ils ne peuvent pas être retrouvés en ligne.');
}

const bytesOf = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, transform: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = source.pipeThrough(transform).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw INVALID;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const unsupported = () => new ShareError('Ce téléphone ne sait pas compresser les codes de partage (WebView trop ancienne)');

/** Code d'une collection : base64url du JSON `{ v, n, i }` compressé (deflate). */
export async function encodeCollection(collection: SharedCollection): Promise<string> {
  if (typeof CompressionStream === 'undefined') throw unsupported();
  const ids = [...new Set(collection.ids.filter(isRetrievableId))].slice(0, MAX_SHARED_ITEMS);
  const json = JSON.stringify({ v: FORMAT_VERSION, n: collection.name.trim().slice(0, MAX_NAME_LENGTH) || t(DEFAULT_NAME), i: ids });
  return toBase64Url(await pipe(bytesOf(json), new CompressionStream('deflate'), Number.POSITIVE_INFINITY));
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Relit un code ; `ShareError` (message affichable) s'il est abîmé, trop récent ou vide. */
export async function decodeCollection(code: string): Promise<SharedCollection> {
  const clean = code.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(clean) || clean.length > MAX_CODE_LENGTH) throw INVALID;
  if (typeof DecompressionStream === 'undefined') throw unsupported();
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(await pipe(fromBase64Url(clean), new DecompressionStream('deflate'), MAX_JSON_BYTES)));
  } catch {
    throw INVALID;
  }
  if (!isPlain(data) || typeof data.v !== 'number') throw INVALID;
  if (data.v > FORMAT_VERSION) throw new ShareError('Ce code vient d’une version plus récente de Prisme : mets l’app à jour');
  const ids = [...new Set((Array.isArray(data.i) ? data.i : []).filter((id): id is string => typeof id === 'string' && isRetrievableId(id)))];
  if (ids.length === 0) throw new ShareError('Ce code ne contient aucun fond que Prisme sait retrouver');
  const name = typeof data.n === 'string' ? data.n.trim().slice(0, MAX_NAME_LENGTH) : '';
  return { name: name || t(DEFAULT_NAME), ids: ids.slice(0, MAX_SHARED_ITEMS) };
}

export const toLink = (code: string): string => `${LINK_PREFIX}${code}`;

/**
 * Codes possibles dans un texte collé, scanné ou reçu par un lien : celui du lien « prisme:// »
 * d'abord, puis toute suite de caractères base64url assez longue (le code seul, ou le message de
 * partage entier).
 */
export function extractCodes(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/prisme:\/\/collection\/([A-Za-z0-9_-]+)/gi)) if (m[1]) out.push(m[1]);
  for (const m of text.matchAll(/[A-Za-z0-9_-]{16,}/g)) if (!out.includes(m[0])) out.push(m[0]);
  return out;
}

/** Lit une collection dans un texte quelconque (lien, code seul ou message de partage collé). */
export async function parseSharedInput(text: string): Promise<{ code: string; collection: SharedCollection }> {
  let failure: ShareError = INVALID;
  for (const code of extractCodes(text)) {
    try {
      return { code, collection: await decodeCollection(code) };
    } catch (error) {
      if (error instanceof ShareError && error !== INVALID) failure = error;
    }
  }
  throw failure;
}

/** Texte du partage Android : une phrase, le lien cliquable, et le code en clair pour les messageries qui ne le rendent pas. */
export function shareMessage(name: string, count: number, code: string): string {
  return [
    tn(
      count,
      'Je partage avec toi ma collection « {name} » ({count} fond d’écran) sur Prisme.',
      'Je partage avec toi ma collection « {name} » ({count} fonds d’écran) sur Prisme.',
      { name },
    ),
    '',
    t('Pour l’ajouter à ta bibliothèque, ouvre ce lien sur un téléphone où Prisme est installé :'),
    toLink(code),
    '',
    t('Si le lien ne s’ouvre pas, copie ce code, puis dans Prisme : Bibliothèque › Collections › Coller un code.'),
    code,
  ].join('\n');
}

export interface ShareBuild {
  code: string;
  link: string;
  /** Fonds dans le code. */
  count: number;
  /** Fonds laissés de côté (images locales). */
  excluded: Wallpaper[];
  /** La collection dépasse `MAX_SHARED_ITEMS` : les premiers fonds seulement sont partagés. */
  truncated: boolean;
}

/** Prépare le partage d'une collection ; null si aucun de ses fonds ne peut être retrouvé en ligne. */
export async function buildShare(name: string, wallpapers: readonly Wallpaper[]): Promise<ShareBuild | null> {
  const { shareable, excluded } = splitShareable(wallpapers);
  if (shareable.length === 0) return null;
  const ids = shareable.map((w) => w.id);
  const code = await encodeCollection({ name, ids });
  return { code, link: toLink(code), count: Math.min(ids.length, MAX_SHARED_ITEMS), excluded, truncated: ids.length > MAX_SHARED_ITEMS };
}
