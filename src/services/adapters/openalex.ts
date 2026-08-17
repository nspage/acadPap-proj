import { Aim, FeedError, PaperCard } from '../../types';

// Product law (user decision 2026-08-17). Do not show this number in the UI.
export const CITED_POOL_MIN_CITATIONS = 5;

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

export async function fetchOpenAlexPapers(aim: Aim, page = 1): Promise<PaperCard[]> {
  const useGeoFilter = localStorage.getItem('filter_geo') === 'true';
  const useImpactFilter = localStorage.getItem('filter_impact') === 'true';

  // We want to fetch papers with full text available, OA, and exclusively in English.
  let filterQuery = `&filter=has_fulltext:true,is_oa:true,language:en`;

  if (useGeoFilter) {
    // Whitelist top research regions: NA (US, CA), Europe (GB, DE, FR, CH, NL, SE, DK, FI, NO, IT, ES, AT, BE, IE), Asia/Oceania (JP, KR, CN, SG, IL, TW, HK, AU, NZ)
    filterQuery += `,institutions.country_code:us|ca|gb|de|fr|ch|nl|se|dk|fi|no|it|es|at|be|ie|jp|kr|cn|sg|il|tw|hk|au|nz`;
  }

  // Hood quality filter. Separate from the sitting recent/cited pool flip.
  if (useImpactFilter) {
    filterQuery += `,cited_by_count:>5`;
  }

  if (aim.pool === 'cited' && !useImpactFilter) {
    filterQuery += `,cited_by_count:>${CITED_POOL_MIN_CITATIONS}`;
  }

  if (aim.openAlexFilter) {
    filterQuery += `,${aim.openAlexFilter}`;
  }

  const sortQuery = `&sort=publication_year:desc`;

  const url = `https://api.openalex.org/works?per_page=15&page=${page}${filterQuery}${sortQuery}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ScDyE5FFaburyQ6XWmb7dY`
    }
  });
  if (res.status === 429) {
    throw new FeedError('OpenAlex quota', 'quota', 429);
  }
  if (!res.ok) {
    throw new FeedError(`OpenAlex error: ${res.status}`, 'transient', res.status);
  }
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
      : [];

    return {
      id: `openalex:${openAlexId}`,
      source: venue,
      sourceType: 'openalex',
      title: work.title || 'Untitled',
      abstract: reconstructAbstract(work.abstract_inverted_index),
      authors,
      publishedDate: work.publication_date || `${work.publication_year}-01-01`,
      url: work.primary_location?.landing_page_url || '',
      pdfUrl,
      doi: work.doi ? work.doi.replace('https://doi.org/', '') : undefined,
      tags,
      hasGrobidXml: Boolean(work.has_content?.grobid_xml),
      unreadable: !work.has_content?.grobid_xml,
      
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
