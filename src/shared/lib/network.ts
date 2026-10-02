import { create } from 'zustand';
import { type NetworkStatus, PrismeSystem } from '@/shared/native/system';

/** État de la connexion vu par Android (connexion limitée = données mobiles en général). */
export const useNetwork = create<NetworkStatus>(() => ({ connected: true, metered: false }));

/** Lit l'état initial puis suit les changements (Wi-Fi ↔ données mobiles). */
export function startNetworkWatch(): () => void {
  void PrismeSystem.getNetworkStatus().then((status) => useNetwork.setState(status), () => undefined);
  const handle = PrismeSystem.addListener('networkChanged', (status) => useNetwork.setState(status));
  return () => void handle.then((h) => h.remove());
}
