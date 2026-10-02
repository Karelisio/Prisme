import { t } from '@/shared/i18n';
import { type ErrorEntry, PrismeSystem } from '@/shared/native/system';

const STORAGE_KEY = 'prisme-errors';
export const MAX_ERRORS = 50;
const MAX_STACK = 4000;

/** Message lisible pour n'importe quelle valeur levée. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export function readJsErrors(): ErrorEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as ErrorEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordError(where: string, error: unknown, now = Date.now()): void {
  const stack = error instanceof Error ? error.stack?.slice(0, MAX_STACK) : undefined;
  const entry: ErrorEntry = { at: now, source: 'js', where, message: describeError(error), ...(stack && { stack }) };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...readJsErrors(), entry].slice(-MAX_ERRORS)));
  } catch {
    // Stockage plein ou indisponible : l'erreur n'est simplement pas gardée.
  }
}

export function clearJsErrors(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Rien à effacer.
  }
}

/** Erreurs non rattrapées de l'interface (exceptions, promesses rejetées). */
export function installErrorLog(): () => void {
  const onError = (e: ErrorEvent) => recordError('Interface', e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => recordError('Interface (promesse)', e.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

/** Journal complet, du plus récent au plus ancien : interface + natif. */
export async function loadErrorLog(): Promise<ErrorEntry[]> {
  const native = await PrismeSystem.getErrorLog().then(
    (r) => r.entries,
    () => [],
  );
  return [...readJsErrors(), ...native].sort((a, b) => b.at - a.at);
}

export async function clearErrorLog(): Promise<void> {
  clearJsErrors();
  await PrismeSystem.clearErrorLog().catch(() => undefined);
}

/** Texte à partager (pour signaler un bug), avec version et appareil. */
export function formatErrorLog(entries: ErrorEntry[], context: string): string {
  const lines = [t("Journal d'erreurs Prisme — {context}", { context }), ''];
  for (const e of entries) {
    lines.push(`[${new Date(e.at).toISOString()}] ${e.source === 'native' ? t('Natif') : t('Interface')} · ${t(e.where)}`, e.message);
    if (e.stack) lines.push(e.stack);
    lines.push('');
  }
  return lines.join('\n').trim();
}
