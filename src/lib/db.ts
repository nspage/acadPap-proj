import Dexie, { type EntityTable } from 'dexie';
import { PaperCard, PaperNote, RepositoryConfig, CachedPdf, CachedContent } from '../types';

export const db = new Dexie('AcademicSerendipityDB') as Dexie & {
  savedPapers: EntityTable<PaperCard, 'id'>;
  notes: EntityTable<PaperNote, 'id'>;
  sources: EntityTable<RepositoryConfig, 'id'>;
  discardedIds: EntityTable<{ id: string; discardedAt: number }, 'id'>;
  pdfCache: EntityTable<CachedPdf, 'paperId'>;
  contentCache: EntityTable<CachedContent, 'paperId'>;
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
    id: 'ch-global-recent',
    name: 'Global Recent',
    type: 'openalex',
    enabled: true,
    category: 'All Fields',
    params: { openAlexFilter: '' }
  }
];

db.version(3).stores({
  savedPapers: 'id, sourceType, publishedDate',
  notes: 'id, paperId, updatedAt',
  sources: 'id, type, enabled',
  discardedIds: 'id, discardedAt',
  pdfCache: 'paperId, cachedAt'
}).upgrade(async (tx) => {
  // Purge old sources (arxiv, zenodo, osf) and insert new openalex channels
  await tx.table('sources').clear();
  await tx.table('sources').bulkAdd(DEFAULT_SOURCES);
});

db.version(4).stores({
  savedPapers: 'id, sourceType, publishedDate',
  notes: 'id, paperId, updatedAt',
  sources: 'id, type, enabled',
  discardedIds: 'id, discardedAt',
  pdfCache: 'paperId, cachedAt',
  contentCache: 'paperId, cachedAt'
});

db.version(5).stores({
  savedPapers: 'id, sourceType, publishedDate',
  notes: 'id, paperId, updatedAt',
  sources: 'id, type, enabled',
  discardedIds: 'id, discardedAt',
  pdfCache: 'paperId, cachedAt',
  contentCache: 'paperId, cachedAt'
}).upgrade(async (tx) => {
  // Purge the old hardcoded T-number predefined feeds and set up the Global Recent feed
  await tx.table('sources').clear();
  await tx.table('sources').bulkAdd(DEFAULT_SOURCES);
});



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
