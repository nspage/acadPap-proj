import { Aim, PaperCard } from '../../types';
import { fetchOpenAlexPapers } from './openalex';

export { CITED_POOL_MIN_CITATIONS } from './openalex';

export async function fetchPapersForAim(aim: Aim, page = 1): Promise<PaperCard[]> {
  return fetchOpenAlexPapers(aim, page);
}
