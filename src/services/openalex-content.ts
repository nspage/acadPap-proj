import { db } from '../lib/db';
import { ContentFetchResult, ContentResult, ParsedSection } from '../types';

const OPENALEX_API_KEY = 'ScDyE5FFaburyQ6XWmb7dY';
const CONTENT_TIMEOUT_MS = 20_000;

export type { ContentResult, ParsedSection };

/**
 * Fetch and parse structured fulltext from OpenAlex Content API.
 * Uses GROBID TEI XML — pre-parsed by OpenAlex, structured into
 * sections/headings/paragraphs. No PDF.js, no CORS proxy, no third-party servers.
 * Cache only after kind === 'ok'. Callers must not invoke this for hint-only cards.
 */
export async function fetchStructuredContent(
  paperId: string,
  opts?: { bypassCache?: boolean; signal?: AbortSignal },
): Promise<ContentFetchResult> {
  const workId = paperId.replace('openalex:', '');

  if (!opts?.bypassCache) {
    const cached = await db.contentCache.get(paperId);
    if (cached?.xmlText) {
      const parsed = parseGrobidXml(cached.xmlText);
      if (parsed.sections.length > 0) {
        return { ok: true, kind: 'ok', content: parsed };
      }
      await db.contentCache.delete(paperId);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONTENT_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  opts?.signal?.addEventListener('abort', onExternalAbort);

  try {
    const url = `https://content.openalex.org/works/${workId}.grobid-xml?api_key=${OPENALEX_API_KEY}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (err) {
      const message = controller.signal.aborted
        ? (opts?.signal?.aborted ? 'aborted' : 'timeout')
        : err instanceof Error ? err.message : 'network';
      if (message !== 'aborted') console.error('OpenAlex Content transient:', message);
      return { ok: false, kind: 'transient', message };
    }

    if (res.status === 404) return { ok: false, kind: 'not_found', status: 404 };
    if (res.status === 429) {
      console.error('OpenAlex Content quota:', workId);
      return { ok: false, kind: 'quota', status: 429 };
    }
    if (!res.ok) {
      console.error('OpenAlex Content transient:', res.status, workId);
      return { ok: false, kind: 'transient', status: res.status, message: `HTTP ${res.status}` };
    }

    let xmlText: string;
    try {
      const ds = new DecompressionStream('gzip');
      const decompressedStream = res.body?.pipeThrough(ds);
      if (!decompressedStream) {
        return { ok: false, kind: 'transient', message: 'empty body stream' };
      }
      xmlText = await new Response(decompressedStream).text();
    } catch (err) {
      const message = controller.signal.aborted
        ? (opts?.signal?.aborted ? 'aborted' : 'timeout')
        : 'decompress failed';
      if (message !== 'aborted') console.error('OpenAlex Content transient:', message, err);
      return { ok: false, kind: 'transient', message };
    }

    if (!xmlText || xmlText.length < 100) {
      await db.contentCache.delete(paperId);
      return { ok: false, kind: 'not_found', status: 200 };
    }

    const parsed = parseGrobidXml(xmlText);
    if (parsed.sections.length === 0) {
      await db.contentCache.delete(paperId);
      return { ok: false, kind: 'not_found', status: 200 };
    }

    await db.contentCache.put({
      paperId,
      xmlText,
      cachedAt: Date.now(),
      sizeBytes: xmlText.length,
    });

    return { ok: true, kind: 'ok', content: parsed };
  } finally {
    clearTimeout(timeout);
    opts?.signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Parse GROBID TEI XML into structured sections using browser-native DOMParser.
 * No external libraries needed.
 */
function parseGrobidXml(xmlText: string): ContentResult {
  // Strip default namespaces so querySelector works natively without complexity
  const cleanXmlText = xmlText.replace(/xmlns="[^"]*"/g, '');
  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanXmlText, 'application/xml');

  // Extract abstract (TEI puts it in <profileDesc><abstract>)
  const abstractEl = doc.querySelector('profileDesc abstract');
  const abstract = abstractEl?.textContent?.trim() || undefined;

  // Extract body sections
  const body = doc.querySelector('body');
  const sections: ParsedSection[] = [];

  if (body) {
    // GROBID structures body as <div> elements, each potentially with a <head> and <p> children
    const divs = body.querySelectorAll(':scope > div');

    if (divs.length > 0) {
      divs.forEach(div => {
        const head = div.querySelector('head');
        const heading = head?.textContent?.trim() || '';
        const paragraphs: string[] = [];

        div.querySelectorAll('p').forEach(p => {
          const text = p.textContent?.trim();
          if (text) paragraphs.push(text);
        });

        if (paragraphs.length > 0) {
          sections.push({ heading, paragraphs });
        }
      });
    } else {
      // Flat structure fallback: just grab all <p> tags
      const paragraphs: string[] = [];
      body.querySelectorAll('p').forEach(p => {
        const text = p.textContent?.trim();
        if (text) paragraphs.push(text);
      });
      if (paragraphs.length > 0) {
        sections.push({ heading: '', paragraphs });
      }
    }
  }

  return { abstract, sections };
}
