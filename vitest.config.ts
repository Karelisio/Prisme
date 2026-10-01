import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'node',
      restoreMocks: true,
      // Ce paquet contient des imports ESM sans extension : il doit passer par Vite.
      server: { deps: { inline: ['@material/material-color-utilities'] } },
    },
  }),
);
