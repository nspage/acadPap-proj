import { PaperCard, RepositoryConfig } from '../../types';

function cleanHtmlText(rawHtml: string): string {
  if (!rawHtml) return '';
  
  let cleaned = rawHtml.replace(/<[^>]*>?/gm, '');

  if (typeof document !== 'undefined') {
    const txt = document.createElement('textarea');
    txt.innerHTML = cleaned;
    cleaned = txt.value;
  }

  return cleaned
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&iacute;/gi, 'í')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&vcute;/gi, 'ú')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchZenodoPapers(config: RepositoryConfig, page = 1): Promise<PaperCard[]> {
  const query = encodeURIComponent(config.params.queryKeywords || 'open access');
  const url = `https://zenodo.org/api/records?q=${query}&size=15&page=${page}&sort=mostrecent`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Zenodo error: ${res.status}`);
  const json = await res.json();

  return (json.hits?.hits || []).map((hit: any) => {
    const pdfFile = hit.files?.find((f: any) => f.type === 'pdf' || f.key?.endsWith('.pdf'));
    // Direct Zenodo binary download endpoint
    const pdfUrl = pdfFile
      ? `https://zenodo.org/records/${hit.id}/files/${pdfFile.key}?download=1`
      : undefined;

    return {
      id: `zenodo:${hit.id}`,
      source: config.name,
      sourceType: 'zenodo',
      title: cleanHtmlText(hit.metadata?.title || 'Untitled'),
      abstract: cleanHtmlText(hit.metadata?.description || 'No abstract provided.'),
      authors: (hit.metadata?.creators || []).map((c: any) => cleanHtmlText(c.name || 'Unknown')),
      publishedDate: hit.metadata?.publication_date || '',
      url: hit.links?.html || `https://zenodo.org/records/${hit.id}`,
      pdfUrl,
      tags: (hit.metadata?.keywords || ['open science']).map((k: string) => cleanHtmlText(k))
    };
  });
}
