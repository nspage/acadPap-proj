import Dexie, { type EntityTable } from 'dexie';
import { PaperCard, PaperNote, RepositoryConfig, CachedPdf } from '../types';

export const db = new Dexie('AcademicSerendipityDB') as Dexie & {
  savedPapers: EntityTable<PaperCard, 'id'>;
  notes: EntityTable<PaperNote, 'id'>;
  sources: EntityTable<RepositoryConfig, 'id'>;
  discardedIds: EntityTable<{ id: string; discardedAt: number }, 'id'>;
  pdfCache: EntityTable<CachedPdf, 'paperId'>;
};

db.version(2).stores({
  savedPapers: 'id, sourceType, publishedDate',
  notes: 'id, paperId, updatedAt',
  sources: 'id, type, enabled',
  discardedIds: 'id, discardedAt',
  pdfCache: 'paperId, cachedAt'
});

export const DEFAULT_SOURCES: RepositoryConfig[] = [
  {
    id: 'osf-socarxiv',
    name: 'SocArXiv (Social Sciences)',
    type: 'osf',
    enabled: true,
    category: 'Social Sciences',
    params: { osfProviderSlug: 'socarxiv' }
  },
  {
    id: 'osf-psyarxiv',
    name: 'PsyArXiv (Psychology)',
    type: 'osf',
    enabled: true,
    category: 'Psychology',
    params: { osfProviderSlug: 'psyarxiv' }
  },
  {
    id: 'arxiv-ai',
    name: 'arXiv (AI & ML)',
    type: 'arxiv',
    enabled: true,
    category: 'Computer Science',
    params: { arxivCategory: 'cs.AI' }
  },
  {
    id: 'zenodo-open',
    name: 'Zenodo (Open Science)',
    type: 'zenodo',
    enabled: true,
    category: 'Interdisciplinary',
    params: { queryKeywords: 'open science' }
  }
];

export async function initializeDatabase() {
  const count = await db.sources.count();
  if (count === 0) {
    await db.sources.bulkAdd(DEFAULT_SOURCES);
  }
}

export async function cachePaperPdf(paperId: string, pdfUrl: string): Promise<Blob> {
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(pdfUrl)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`Failed to fetch PDF binary: ${res.statusText}`);
  const blob = await res.blob();

  await db.pdfCache.put({
    paperId,
    blob,
    cachedAt: Date.now(),
    sizeBytes: blob.size
  });

  return blob;
}

export async function getCachedPaperPdf(paperId: string): Promise<Blob | null> {
  const cached = await db.pdfCache.get(paperId);
  return cached ? cached.blob : null;
}
