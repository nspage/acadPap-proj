export async function onRequest(context: any) {
  const request = context.request;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, POST',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (!targetUrl) {
    return new Response('Missing "url" parameter', { status: 400, headers: corsHeaders });
  }

  try {
    const incomingAccept = request.headers.get('Accept');
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': incomingAccept && incomingAccept !== '*/*' ? incomingAccept : 'application/pdf, application/json, text/plain, */*'
      },
      redirect: 'follow'
    });

    if (!upstreamRes.ok) {
      return new Response(`Upstream error ${upstreamRes.status}: ${upstreamRes.statusText}`, {
        status: upstreamRes.status,
        headers: corsHeaders
      });
    }

    const responseHeaders = new Headers(upstreamRes.headers);
    // Strip hop-by-hop and compression headers to prevent double-decompression corruption in browser
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');
    responseHeaders.delete('connection');

    Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));
    if (!responseHeaders.has('Content-Type')) {
      responseHeaders.set('Content-Type', 'application/pdf');
    }

    return new Response(upstreamRes.body, {
      status: 200,
      headers: responseHeaders
    });
  } catch (err: any) {
    return new Response(`Edge Proxy Error: ${err.message}`, { status: 500, headers: corsHeaders });
  }
}
