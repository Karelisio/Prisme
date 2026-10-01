import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // WebView Android récente (mises à jour via le Play Store).
    target: 'es2022',
    // Les icônes SVG sont importées en texte brut : pas besoin de les inliner en base64.
    assetsInlineLimit: 0,
  },
});
