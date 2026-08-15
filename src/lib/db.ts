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
    id: 'openalex-cs-ai',
    name: 'OpenAlex (AI & ML)',
    type: 'openalex',
    enabled: true,
    category: 'Computer Science',
    params: { queryKeywords: 'artificial intelligence OR machine learning' }
  },
  {
    id: 'openalex-biology',
    name: 'OpenAlex (Biology)',
    type: 'openalex',
    enabled: true,
    category: 'Biology',
    params: { queryKeywords: 'computational biology OR bioinformatics' }
  },
  {
    id: 'openalex-physics',
    name: 'OpenAlex (Physics)',
    type: 'openalex',
    enabled: true,
    category: 'Physics',
    params: { queryKeywords: 'quantum computing OR astrophysics' }
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
