import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Academic Serendipity Reader',
        short_name: 'Serendipity',
        description: 'Local-first paper discovery, PDF reader & AI learning journal',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    }),
    {
      name: 'local-cors-edge-proxy',
      configureServer(server) {
        server.middlewares.use('/api/proxy', async (req: IncomingMessage, res: ServerResponse) => {
          try {
            const reqUrl = new URL(req.url || '', `http://${req.headers.host}`);
            const targetUrl = reqUrl.searchParams.get('url');

            if (!targetUrl) {
              res.statusCode = 400;
              res.end('Missing "url" query parameter');
              return;
            }

            // Fetch target URL server-side from dev server
            const upstreamRes = await fetch(targetUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
              }
            });

            res.statusCode = upstreamRes.status;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');

            const contentType = upstreamRes.headers.get('content-type');
            if (contentType) {
              res.setHeader('Content-Type', contentType);
            }

            const arrayBuffer = await upstreamRes.arrayBuffer();
            res.end(Buffer.from(arrayBuffer));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(`Proxy error: ${err.message}`);
          }
        });
      }
    }
  ]
});
