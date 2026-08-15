import { XMLParser } from 'fast-xml-parser';
import { PaperCard, RepositoryConfig } from '../../types';
import { fetchWithCORSProxy } from '../../lib/proxy';

export async function fetchArxivPapers(config: RepositoryConfig, page = 1): Promise<PaperCard[]> {
  const start = (page - 1) * 15;
  const category = config.params.arxivCategory || 'cs.AI';
  const url = `https://export.arxiv.org/api/query?search_query=cat:${category}&start=${start}&max_results=15&sortBy=submittedDate&sortOrder=descending`;

  const res = await fetchWithCORSProxy(url);
  if (!res.ok) throw new Error(`arXiv error: ${res.status}`);
  const xmlData = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const parsed = parser.parse(xmlData);
  const entries = Array.isArray(parsed.feed?.entry) 
    ? parsed.feed.entry 
    : parsed.feed?.entry ? [parsed.feed.entry] : [];

  return entries.map((entry: any) => {
    const rawId = entry.id || '';
    const arxivId = rawId.split('/abs/').pop() || rawId;
    
    let pdfUrl: string | undefined;
    if (Array.isArray(entry.link)) {
      const pdfLink = entry.link.find((l: any) => l['@_title'] === 'pdf' || l['@_type'] === 'application/pdf');
      pdfUrl = pdfLink ? pdfLink['@_href'] : undefined;
    }

    const authors = Array.isArray(entry.author)
      ? entry.author.map((a: any) => a.name)
      : entry.author ? [entry.author.name] : ['Unknown'];

    return {
      id: `arxiv:${arxivId}`,
      source: config.name,
      sourceType: 'arxiv',
      title: (entry.title || '').replace(/\s+/g, ' ').trim(),
      abstract: (entry.summary || '').replace(/\s+/g, ' ').trim(),
      authors,
      publishedDate: entry.published?.split('T')[0] || '',
      url: rawId,
      pdfUrl: pdfUrl || `https://arxiv.org/pdf/${arxivId}.pdf`,
      tags: [category]
    };
  });
}
