import { db } from '../lib/db';

const OPENALEX_API_KEY = 'ScDyE5FFaburyQ6XWmb7dY';

export interface ParsedSection {
  heading: string;
  paragraphs: string[];
}

export interface ContentResult {
  abstract?: string;
  sections: ParsedSection[];
}

/**
 * Fetch and parse structured fulltext from OpenAlex Content API.
 * Uses GROBID TEI XML — pre-parsed by OpenAlex, structured into
 * sections/headings/paragraphs. No PDF.js, no CORS proxy, no third-party servers.
 */
export async function fetchStructuredContent(paperId: string): Promise<ContentResult | null> {
  // paperId format: "openalex:W12345" → extract "W12345"
  const workId = paperId.replace('openalex:', '');

  // 1. Check IndexedDB cache
  const cached = await db.contentCache.get(paperId);
  if (cached?.xmlText) {
    return parseGrobidXml(cached.xmlText);
  }

  // 2. Fetch from Content API
  try {
    const url = `https://content.openalex.org/works/${workId}.grobid-xml?api_key=${OPENALEX_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    // 3. Decompress the gzip stream from OpenAlex
    const ds = new DecompressionStream('gzip');
    const decompressedStream = res.body?.pipeThrough(ds);
    if (!decompressedStream) return null;

    const decompressedRes = new Response(decompressedStream);
    let xmlText = await decompressedRes.text();
    if (!xmlText || xmlText.length < 100) return null;

    // 4. Cache raw XML
    await db.contentCache.put({
      paperId,
      xmlText,
      cachedAt: Date.now(),
      sizeBytes: xmlText.length
    });

    // 5. Parse and return
    return parseGrobidXml(xmlText);
  } catch (err) {
    console.warn('OpenAlex Content API fetch failed:', err);
    return null;
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
