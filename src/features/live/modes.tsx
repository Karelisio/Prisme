import type { ComponentType } from 'react';
import type { LiveMode, LiveStatus } from '@/shared/native/automation';
import type { IconName } from '@/shared/ui/icons';
import { ImageSection } from './ImageSection';
import { ReliefSection } from './ReliefSection';

export interface ModeSectionProps {
  /** Option « Fonds animés » activée dans les réglages. */
  optionOn: boolean;
  status: LiveStatus | undefined;
  /** Relit l'état du natif (après une activation, un réglage modifié). */
  refresh: () => void;
}

export interface LiveModeDef {
  key: LiveMode;
  label: string;
  icon: IconName;
  /** Réglages et bouton d'activation du genre. */
  Section: ComponentType<ModeSectionProps>;
}

/** Genre par défaut, et celui des fonds appliqués depuis l'aperçu. */
export const PHOTO_MODE: LiveModeDef = { key: 'image', label: 'Photo', icon: 'image', Section: ImageSection };

/** Genres proposés, dans l'ordre des puces. */
export const LIVE_MODES: readonly LiveModeDef[] = [
  PHOTO_MODE,
  { key: 'relief', label: 'Relief 3D', icon: 'layers', Section: ReliefSection },
];
