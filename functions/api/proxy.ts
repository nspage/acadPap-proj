export async function onRequest(context: any) {
  const url = new URL(context.request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing "url" parameter', { status: 400 });
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf, application/octet-stream, text/plain, */*'
      },
      redirect: 'follow'
    });

    if (!upstreamRes.ok) {
      return new Response(`Upstream error ${upstreamRes.status}: ${upstreamRes.statusText}`, {
        status: upstreamRes.status
      });
    }

    const responseHeaders = new Headers(upstreamRes.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    if (!responseHeaders.has('Content-Type')) {
      responseHeaders.set('Content-Type', 'application/pdf');
    }

    return new Response(upstreamRes.body, {
      status: 200,
      headers: responseHeaders
    });
  } catch (err: any) {
    return new Response(`Edge Proxy Error: ${err.message}`, { status: 500 });
  }
}
