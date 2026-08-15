import { PaperCard, RepositoryConfig } from '../../types';
import { fetchWithCORSProxy } from '../../lib/proxy';

export async function fetchZenodoPapers(config: RepositoryConfig, page = 1): Promise<PaperCard[]> {
  const query = encodeURIComponent(config.params.queryKeywords || 'open access');
  const url = `https://zenodo.org/api/records?q=${query}&size=15&page=${page}&sort=mostrecent`;

  const res = await fetchWithCORSProxy(url);
  if (!res.ok) throw new Error(`Zenodo error: ${res.status}`);
  const json = await res.json();

  return (json.hits?.hits || []).map((hit: any) => ({
    id: `zenodo:${hit.id}`,
    source: config.name,
    sourceType: 'zenodo',
    title: hit.metadata?.title || 'Untitled',
    abstract: (hit.metadata?.description || '').replace(/<[^>]*>?/gm, '').trim(),
    authors: (hit.metadata?.creators || []).map((c: any) => c.name || 'Unknown'),
    publishedDate: hit.metadata?.publication_date || '',
    url: hit.links?.html || `https://zenodo.org/records/${hit.id}`,
    pdfUrl: hit.files?.find((f: any) => f.type === 'pdf' || f.key?.endsWith('.pdf'))?.links?.self,
    tags: hit.metadata?.keywords || ['open science']
  }));
}
