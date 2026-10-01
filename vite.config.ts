import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(`${version}.${process.env.PRISME_BUILD_NUMBER ?? 'dev'}`),
  },
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
