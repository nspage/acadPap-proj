import { PaperCard, RepositoryConfig } from '../../types';
import { fetchOSFPapers } from './osf';
import { fetchArxivPapers } from './arxiv';
import { fetchZenodoPapers } from './zenodo';

export async function fetchPapersFromSource(config: RepositoryConfig, page = 1): Promise<PaperCard[]> {
  if (!config.enabled) return [];
  try {
    switch (config.type) {
      case 'osf':
        return await fetchOSFPapers(config, page);
      case 'arxiv':
        return await fetchArxivPapers(config, page);
      case 'zenodo':
        return await fetchZenodoPapers(config, page);
      default:
        console.warn(`Unsupported repository type: ${config.type}`);
        return [];
    }
  } catch (err) {
    console.error(`Failed to fetch from source [${config.name}]:`, err);
    return [];
  }
}

export async function fetchAllEnabledPapers(sources: RepositoryConfig[]): Promise<PaperCard[]> {
  const activeSources = sources.filter((s) => s.enabled);
  if (activeSources.length === 0) return [];

  const results = await Promise.allSettled(
    activeSources.map((source) => fetchPapersFromSource(source, 1))
  );

  const allPapers: PaperCard[] = [];
  results.forEach((res) => {
    if (res.status === 'fulfilled') {
      allPapers.push(...res.value);
    }
  });

  // Fisher-Yates shuffle for true academic serendipity
  for (let i = allPapers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPapers[i], allPapers[j]] = [allPapers[j], allPapers[i]];
  }

  return allPapers;
}
