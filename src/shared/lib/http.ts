import { CapacitorHttp } from '@capacitor/core';
import { t } from '@/shared/i18n';
import { isNative } from '@/shared/native';

export interface HttpResponse<T> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(t('Réseau indisponible'), { cause });
    this.name = 'NetworkError';
  }
}

/**
 * GET JSON. Sur Android, passe par la pile HTTP native (pas de restriction CORS) ;
 * dans le navigateur (développement, tests), par fetch.
 */
export async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<HttpResponse<T>> {
  const allHeaders = { Accept: 'application/json', ...headers };
  try {
    if (isNative) {
      const res = await CapacitorHttp.get({ url, headers: allHeaders, connectTimeout: 15_000, readTimeout: 20_000 });
      const data = typeof res.data === 'string' && res.data.startsWith('{') ? JSON.parse(res.data) : res.data;
      return { status: res.status, data: data as T, headers: lowerCaseKeys(res.headers) };
    }
    const res = await fetch(url, { headers: allHeaders });
    const isJson = res.headers.get('content-type')?.includes('json');
    const data = isJson ? await res.json() : await res.text();
    return { status: res.status, data: data as T, headers: lowerCaseKeys(Object.fromEntries(res.headers)) };
  } catch (error) {
    throw new NetworkError(error);
  }
}

function lowerCaseKeys(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) out[key.toLowerCase()] = value;
  return out;
}

/** Ajoute ou remplace des paramètres de requête. */
export function withParams(url: string, params: Record<string, string | number | undefined>): string {
  const u = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) u.searchParams.set(key, String(value));
  }
  return u.toString();
}
