import { PaperCard, RepositoryConfig } from '../../types';
import { fetchWithCORSProxy } from '../../lib/proxy';

export async function fetchOSFPapers(config: RepositoryConfig, page = 1): Promise<PaperCard[]> {
  const slug = config.params.osfProviderSlug || 'socarxiv';
  const query = config.params.queryKeywords 
    ? `&filter[title,description]=${encodeURIComponent(config.params.queryKeywords)}` 
    : '';
  
  const endpoint = `https://api.osf.io/v2/preprints/?filter[provider]=${slug}${query}&page=${page}&page[size]=15&embed=bibliographic_contributors`;
  const res = await fetchWithCORSProxy(endpoint);
  if (!res.ok) throw new Error(`OSF error: ${res.status}`);
  const json = await res.json();

  return (json.data || []).map((item: any) => {
    const landingUrl = item.links?.html || `https://osf.io/preprints/${slug}/${item.id}`;
    // Direct PDF binary download link from OSF
    const pdfUrl = `${landingUrl}/download`;

    return {
      id: `osf:${slug}:${item.id}`,
      source: config.name,
      sourceType: 'osf',
      title: item.attributes?.title || 'Untitled',
      abstract: (item.attributes?.description || 'No abstract provided.').trim(),
      authors: item.embeds?.bibliographic_contributors?.data?.map(
        (c: any) => c.embeds?.users?.data?.attributes?.full_name || c.attributes?.bibliographic_name || 'Unknown'
      ) || ['Unknown'],
      publishedDate: (item.attributes?.date_published || item.attributes?.date_created || '').split('T')[0],
      url: landingUrl,
      pdfUrl,
      tags: item.attributes?.tags || [slug]
    };
  });
}
