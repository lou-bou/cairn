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
        // Page loads try the network first, so Cloudflare Access can redirect to its login when the
        // session has expired. A cached page would hide the login, and the app could never recover.
        // /cdn-cgi/ is Access's own login callback, which sets the cookie: it must never be answered here.
        navigateFallback: null,
        directoryIndex: null,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' && !/^\/(api|cdn-cgi)\//.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cairn-pages',
              networkTimeoutSeconds: 4,
              // Not status 0: the login redirect is an opaque response and must never be cached.
              cacheableResponse: { statuses: [200] },
              precacheFallback: { fallbackURL: '/index.html' },
            },
          },
        ],
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
