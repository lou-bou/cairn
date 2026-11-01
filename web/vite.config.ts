import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'brand/*.svg'],
      manifest: {
        name: 'Cairn',
        short_name: 'Cairn',
        description: 'Track money in and out toward a goal, one milestone at a time.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Manifest colors can't read CSS tokens; these match the default light theme.
        background_color: '#f6f5f2',
        theme_color: '#f6f5f2',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell is precached; API calls always go to the network (offline data comes from the query cache).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${process.env.PORT ?? 8080}`,
    },
  },
});
