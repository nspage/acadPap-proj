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
        display: 'standalone'
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

            // Fetch target URL server-side with full redirect following and Chrome User-Agent
            const upstreamRes = await fetch(targetUrl, {
              headers: {
                'User-Agent': 'AcademicSerendipityReader/1.0 (mailto:admin@example.com)',
                'Accept': 'application/pdf, application/octet-stream, text/plain, */*'
              },
              redirect: 'follow'
            });

            if (!upstreamRes.ok) {
              res.statusCode = upstreamRes.status;
              res.end(`Upstream returned ${upstreamRes.status}`);
              return;
            }

            res.statusCode = 200;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');

            const contentType = upstreamRes.headers.get('content-type') || 'application/pdf';
            res.setHeader('Content-Type', contentType);

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
