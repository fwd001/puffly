import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tsconfigPaths from 'vite-tsconfig-paths';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Puffly ships as an offline-first static app (SPEC.md §53): the service worker precaches
 * the shell and the game assets, and everything else lives in IndexedDB on the device
 * (§52). No backend, no account, no CDN dependency.
 */
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Puffly',
        short_name: 'Puffly',
        description: 'Take a break. Skip the smoke.',
        // The game itself is language independent (SPEC.md §5); only the manifest declares one.
        lang: 'en',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#121317',
        theme_color: '#121317',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 5175,
  },
});
