import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.karelisio.prisme',
  appName: 'Prisme',
  webDir: 'dist',
  android: {
    // Évite le flash blanc au démarrage en mode sombre.
    backgroundColor: '#000000',
  },
  plugins: {
    SystemBars: {
      // Affichage bord à bord : les marges système sont exposées en variables CSS --safe-area-inset-*.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
