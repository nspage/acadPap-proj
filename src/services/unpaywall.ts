import { PaperCard } from '../types';

export async function resolvePdfUrl(paper: PaperCard): Promise<string | null> {
  // 1. If it's arXiv, we know how to get the PDF reliably.
  if (paper.url.includes('arxiv.org')) {
    const arxivId = paper.url.split('/').pop()?.replace('v1', '').replace('.pdf', '');
    return `https://arxiv.org/pdf/${arxivId}`;
  }

  // 2. If we have a DOI, check Unpaywall for the best OA PDF location.
  if (paper.doi) {
    try {
      const res = await fetch(`https://api.unpaywall.org/v2/${paper.doi}?email=nspage@gmail.com`);
      if (res.ok) {
        const data = await res.json();
        // Unpaywall provides the best OA location, check if it has a direct PDF URL
        if (data.best_oa_location?.url_for_pdf) {
          return data.best_oa_location.url_for_pdf;
        }
      }
    } catch (e) {
      console.warn('Unpaywall resolution failed', e);
    }
  }

  // 3. Fallback to OpenAlex's provided pdfUrl if any
  if (paper.pdfUrl) {
    return paper.pdfUrl;
  }

  return null;
}
