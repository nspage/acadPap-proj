import { PaperCard, RepositoryConfig } from '../../types';

function reconstructAbstract(invertedIndex: Record<string, number[]> | null): string {
  if (!invertedIndex) return '';
  const words: string[] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.filter(Boolean).join(' ').trim();
}

export async function fetchOpenAlexPapers(config: RepositoryConfig, page = 1): Promise<PaperCard[]> {
  const query = config.params.queryKeywords || '';
  const searchQuery = query ? `&search=${encodeURIComponent(query)}` : '';
  
  // We want to fetch papers with full text available or OA.
  // We prioritize those that have an OA URL or primary location PDF.
  let filterQuery = `&filter=has_fulltext:true,is_oa:true`;
  if (config.params.openAlexFilter) {
    filterQuery = `&filter=has_fulltext:true,is_oa:true,${config.params.openAlexFilter}`;
  }
  
  const url = `https://api.openalex.org/works?per_page=15&page=${page}${filterQuery}${searchQuery}&sort=publication_year:desc`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ScDyE5FFaburyQ6XWmb7dY`
    }
  });
  if (!res.ok) throw new Error(`OpenAlex error: ${res.status}`);
  const data = await res.json();

  const works = data.results || [];

  return works.map((work: any) => {
    // OpenAlex IDs are URLs like "https://openalex.org/W12345"
    const openAlexId = work.id.split('/').pop() || work.id;
    
    // Extract authors
    const authors = Array.isArray(work.authorships)
      ? work.authorships.map((a: any) => a.author?.display_name || 'Unknown Author')
      : ['Unknown Author'];

    // Extract PDF URL (OpenAlex provides primary_location.pdf_url or open_access.oa_url)
    let pdfUrl = '';
    if (work.primary_location?.pdf_url) {
      pdfUrl = work.primary_location.pdf_url;
    } else if (work.open_access?.oa_url) {
      pdfUrl = work.open_access.oa_url;
    }
    
    // Convert arxiv.org to export.arxiv.org for native CORS
    if (pdfUrl.includes('arxiv.org/pdf')) {
      pdfUrl = pdfUrl.replace('arxiv.org/pdf', 'export.arxiv.org/pdf');
    }

    // Determine publisher / venue
    const venue = work.primary_location?.source?.display_name || 'OpenAlex';

    // Topics / Tags
    const tags = Array.isArray(work.topics) 
      ? work.topics.map((t: any) => t.display_name).slice(0, 3) 
      : [config.category];

    return {
      id: `openalex:${openAlexId}`,
      source: venue,
      sourceType: 'openalex',
      title: work.title || 'Untitled',
      abstract: reconstructAbstract(work.abstract_inverted_index),
      authors,
      publishedDate: work.publication_date || `${work.publication_year}-01-01`,
      url: work.id,
      pdfUrl,
      tags
    };
  });
}
