import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const apiProxy = {
  // Web e API no mesmo endereço: o navegador fala só com o Vite, que repassa /api (e o WebSocket)
  '/api': { target: 'http://localhost:3000', ws: true },
}

/*
 * Abrindo o app pelo celular por um túnel (ngrok), o endereço deixa de ser localhost.
 * Basta rodar com BOLSO_TUNNEL_HOST=seu-dominio.ngrok-free.app: o Vite passa a aceitar esse
 * endereço e o recarregamento automático se liga pela porta 443 (o túnel é HTTPS).
 */
const tunnelHost = process.env.BOLSO_TUNNEL_HOST

// Portas fixas: se a porta estiver ocupada (outro `pnpm dev` aberto), o Vite para com erro em vez
// de pular para a seguinte em silêncio. Numa porta diferente o app até abre, mas a API não confia
// nesse endereço (PUBLIC_URL / TRUSTED_ORIGINS) e recusa login e logout.
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
    ...(tunnelHost
      ? { host: true, allowedHosts: [tunnelHost], hmr: { clientPort: 443, host: tunnelHost } }
      : {}),
  },
  preview: { port: 4173, strictPort: true, proxy: apiProxy },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    // O plugin do router precisa vir antes do plugin do React
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'logo.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/',
        name: 'Bolso — Orçamento colaborativo',
        short_name: 'Bolso',
        description: 'Orçamento colaborativo, em tempo real.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#09090b',
        theme_color: '#09090b',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // A API (próxima etapa) nunca deve ser respondida pelo cache do service worker
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
