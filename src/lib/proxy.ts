/**
 * Routes external API or PDF stream fetches through the Edge Proxy endpoint (/api/proxy).
 * In development, Vite dev server proxies /api/proxy server-side.
 * In production, Edge Function / Worker strips CORS and pipes raw headers.
 */
export async function fetchWithCORSProxy(targetUrl: string, init?: RequestInit): Promise<Response> {
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  return fetch(proxyUrl, init);
}
