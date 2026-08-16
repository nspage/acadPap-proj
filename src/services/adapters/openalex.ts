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
  
  const useGeoFilter = localStorage.getItem('filter_geo') === 'true';
  const useImpactFilter = localStorage.getItem('filter_impact') === 'true';
  
  // We want to fetch papers with full text available, OA, and exclusively in English.
  let filterQuery = `&filter=has_fulltext:true,is_oa:true,language:en`;
  
  if (useGeoFilter) {
    // Whitelist top research regions: NA (US, CA), Europe (GB, DE, FR, CH, NL, SE, DK, FI, NO, IT, ES, AT, BE, IE), Asia/Oceania (JP, KR, CN, SG, IL, TW, HK, AU, NZ)
    filterQuery += `,institutions.country_code:us|ca|gb|de|fr|ch|nl|se|dk|fi|no|it|es|at|be|ie|jp|kr|cn|sg|il|tw|hk|au|nz`;
  }
  
  if (useImpactFilter) {
    // 5+ citations ensures the paper has some proven baseline impact
    filterQuery += `,cited_by_count:>5`;
  }
  
  if (config.params.openAlexFilter) {
    filterQuery += `,${config.params.openAlexFilter}`;
  }
  
  const sortImpact = localStorage.getItem('sort_impact') === 'true';
  const sortQuery = sortImpact ? `&sort=publication_year:desc,cited_by_count:desc` : `&sort=publication_year:desc`;

  const url = `https://api.openalex.org/works?per_page=15&page=${page}${filterQuery}${searchQuery}${sortQuery}`;

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
      url: work.primary_location?.landing_page_url || work.id,
      pdfUrl,
      doi: work.doi ? work.doi.replace('https://doi.org/', '') : undefined,
      tags,
      hasContent: Boolean(work.has_content?.grobid_xml || work.has_content?.pdf),
      
      citationCount: work.cited_by_count,
      fwci: work.fwci,
      documentType: work.type || work.primary_location?.raw_type,
      oaStatus: work.open_access?.oa_status,
      isRetracted: work.is_retracted,
      referencedWorksCount: work.referenced_works_count,
      primaryInstitution: work.authorships?.[0]?.institutions?.[0]?.display_name,
      primaryInstitutionCountry: work.authorships?.[0]?.institutions?.[0]?.country_code,
      funders: Array.isArray(work.funders) ? work.funders.map((f: any) => f.display_name) : [],
      sdgs: Array.isArray(work.sustainable_development_goals) ? work.sustainable_development_goals.map((s: any) => s.display_name) : [],
      fullAuthorships: Array.isArray(work.authorships) ? work.authorships.map((a: any) => ({
        name: a.author?.display_name || 'Unknown',
        institution: a.institutions?.[0]?.display_name || 'Unknown Institution',
        countryCode: a.institutions?.[0]?.country_code || ''
      })) : []
    };
  });
}
