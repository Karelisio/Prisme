import { useSettings } from '@/features/settings/store';
import { type HapticKind, PrismeSystem } from '@/shared/native/system';

/** Retour haptique (s'il est activé dans les réglages de Prisme et du système). */
export function haptic(kind: HapticKind): void {
  if (!useSettings.getState().haptics) return;
  void PrismeSystem.haptic({ kind }).catch(() => undefined);
}
