import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type AutomationPrefs, DEFAULT_AUTOMATION } from './model';

interface AutomationActions {
  updateRotation: (patch: Partial<AutomationPrefs['rotation']>) => void;
  updateDynamic: (patch: Partial<AutomationPrefs['dynamic']>) => void;
  updatePlaces: (patch: Partial<AutomationPrefs['places']>) => void;
  updateFocus: (patch: Partial<AutomationPrefs['focus']>) => void;
  updateEvents: (patch: Partial<AutomationPrefs['events']>) => void;
  updateDim: (patch: Partial<AutomationPrefs['dim']>) => void;
}

export const useAutomationPrefs = create<AutomationPrefs & AutomationActions>()(
  persist(
    (set) => ({
      ...DEFAULT_AUTOMATION,
      updateRotation: (patch) => set((s) => ({ rotation: { ...s.rotation, ...patch } })),
      updateDynamic: (patch) => set((s) => ({ dynamic: { ...s.dynamic, ...patch } })),
      updatePlaces: (patch) => set((s) => ({ places: { ...s.places, ...patch } })),
      updateFocus: (patch) => set((s) => ({ focus: { ...s.focus, ...patch } })),
      updateEvents: (patch) => set((s) => ({ events: { ...s.events, ...patch } })),
      updateDim: (patch) => set((s) => ({ dim: { ...s.dim, ...patch } })),
    }),
    {
      name: 'prisme-automation',
      version: 1,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AutomationPrefs>;
        return {
          ...current,
          rotation: { ...current.rotation, ...saved.rotation },
          dynamic: { ...current.dynamic, ...saved.dynamic },
          places: { ...current.places, ...saved.places },
          focus: { ...current.focus, ...saved.focus },
          events: { ...current.events, ...saved.events },
          dim: { ...current.dim, ...saved.dim },
        };
      },
    },
  ),
);
