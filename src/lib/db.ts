import Dexie, { type EntityTable } from 'dexie';
import { Aim, PaperCard, PaperNote, RepositoryConfig, CachedPdf, CachedContent, ReadingPlaceRow, JournalTombstone } from '../types';

export const db = new Dexie('AcademicSerendipityDB') as Dexie & {
  savedPapers: EntityTable<PaperCard, 'id'>;
  notes: EntityTable<PaperNote, 'id'>;
  sources: EntityTable<RepositoryConfig, 'id'>;
  discardedIds: EntityTable<{ id: string; discardedAt: number }, 'id'>;
  pdfCache: EntityTable<CachedPdf, 'paperId'>;
  contentCache: EntityTable<CachedContent, 'paperId'>;
  aims: EntityTable<Aim, 'id'>;
  readingPlaces: EntityTable<ReadingPlaceRow, 'paperId'>;
  journalTombstones: EntityTable<JournalTombstone, 'id'>;
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

db.version(6).stores({
  savedPapers: 'id, sourceType, publishedDate, updatedAt',
  notes: 'id, paperId, updatedAt',
  sources: 'id, type, enabled',
  discardedIds: 'id, discardedAt',
  pdfCache: 'paperId, cachedAt',
  contentCache: 'paperId, cachedAt',
  aims: 'id, kind, updatedAt',
  readingPlaces: 'paperId, updatedAt',
  journalTombstones: 'id, deletedAt',
}).upgrade(async (tx) => {
  const now = Date.now();
  const sources = await tx.table('sources').toArray() as RepositoryConfig[];
  const aims: Aim[] = sources.map((source) => sourceToAimRow(source, now));
  if (aims.length > 0) {
    await tx.table('aims').bulkAdd(aims);
  }

  const papers = await tx.table('savedPapers').toArray() as PaperCard[];
  for (const paper of papers) {
    if (paper.updatedAt == null) {
      await tx.table('savedPapers').update(paper.id, { updatedAt: now });
    }
  }

  const enabled = sources.find((source) => source.enabled);
  const activeAimId = enabled ? aimIdFromSourceId(enabled.id) : 'global-recent';
  try {
    localStorage.setItem('active_aim_id', activeAimId);
  } catch {
    // private mode / denied storage — boot will default to global-recent
  }
});

function aimIdFromSourceId(sourceId: string): string {
  if (sourceId === 'ch-global-recent') return 'global-recent';
  if (sourceId.startsWith('openalex-topic-')) return `topic:${sourceId.slice('openalex-topic-'.length)}`;
  return sourceId;
}

function sourceToAimRow(source: RepositoryConfig, now: number): Aim {
  if (source.id === 'ch-global-recent') {
    return {
      id: 'global-recent',
      kind: 'global-recent',
      name: source.name || 'Global Recent',
      openAlexFilter: source.params.openAlexFilter || '',
      leftoverIds: [],
      leftoverCards: [],
      pool: 'recent',
      lastFetchAt: null,
      lastFetchOk: false,
      updatedAt: now,
    };
  }
  const topicId = source.id.startsWith('openalex-topic-')
    ? source.id.slice('openalex-topic-'.length)
    : undefined;
  return {
    id: topicId ? `topic:${topicId}` : source.id,
    kind: 'topic',
    name: source.name,
    topicId,
    openAlexFilter: source.params.openAlexFilter || (topicId ? `topics.id:${topicId}` : ''),
    leftoverIds: [],
    leftoverCards: [],
    pool: 'recent',
    lastFetchAt: null,
    lastFetchOk: false,
    updatedAt: now,
  };
}

export async function initializeDatabase() {
  const sourceCount = await db.sources.count();
  if (sourceCount === 0) {
    await db.sources.bulkAdd(DEFAULT_SOURCES);
  }

  const aimCount = await db.aims.count();
  if (aimCount === 0) {
    const sources = await db.sources.toArray();
    const now = Date.now();
    const rows = (sources.length > 0 ? sources : DEFAULT_SOURCES).map((source) => sourceToAimRow(source, now));
    await db.aims.bulkAdd(rows);
  }

  if (!localStorage.getItem('active_aim_id')) {
    const enabled = (await db.sources.toArray()).find((source) => source.enabled);
    localStorage.setItem('active_aim_id', enabled ? aimIdFromSourceId(enabled.id) : 'global-recent');
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
