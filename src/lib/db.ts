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
    id: 'ch-all-biz',
    name: 'All Business & Tech',
    type: 'openalex',
    enabled: true,
    category: 'Business & Tech',
    params: { openAlexFilter: 'topics.id:t10003|t10058|t10145|t10344|t10609|t11161|t12128|t10763|t11715|t11891|t11995|t13053|t13370|t13706|t14182' }
  },
  {
    id: 'ch-innovation',
    name: 'Innovation & Enterprise',
    type: 'openalex',
    enabled: false,
    category: 'Innovation',
    params: { openAlexFilter: 'topics.id:t10003|t10058|t13053' }
  },
  {
    id: 'ch-marketing',
    name: 'Marketing & Consumer',
    type: 'openalex',
    enabled: false,
    category: 'Marketing',
    params: { openAlexFilter: 'topics.id:t10145|t10609|t11161' }
  },
  {
    id: 'ch-ai-data',
    name: 'AI, Data & FinTech',
    type: 'openalex',
    enabled: false,
    category: 'AI & Data',
    params: { openAlexFilter: 'topics.id:t11891|t11995|t12128|t10763' }
  },
  {
    id: 'ch-management',
    name: 'Management & Org',
    type: 'openalex',
    enabled: false,
    category: 'Management',
    params: { openAlexFilter: 'topics.id:t10344|t13706|t11715|t13370' }
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
