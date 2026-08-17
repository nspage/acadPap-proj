import { db } from '../lib/db';
import { Aim, PaperCard, Pool, RepositoryConfig } from '../types';

const ACTIVE_AIM_KEY = 'active_aim_id';

export function getActiveAimId(): string {
  return localStorage.getItem(ACTIVE_AIM_KEY) || 'global-recent';
}

export function setActiveAimId(id: string): void {
  localStorage.setItem(ACTIVE_AIM_KEY, id);
}

export function aimIdFromSourceId(sourceId: string): string {
  if (sourceId === 'ch-global-recent') return 'global-recent';
  if (sourceId.startsWith('openalex-topic-')) return `topic:${sourceId.slice('openalex-topic-'.length)}`;
  return sourceId;
}

export function sourceIdFromAimId(aimId: string): string {
  if (aimId === 'global-recent') return 'ch-global-recent';
  if (aimId.startsWith('topic:')) return `openalex-topic-${aimId.slice('topic:'.length)}`;
  return aimId;
}

export function aimFromSource(source: RepositoryConfig, now = Date.now()): Aim {
  if (source.id === 'ch-global-recent') {
    return emptyAim({
      id: 'global-recent',
      kind: 'global-recent',
      name: source.name || 'Global Recent',
      openAlexFilter: source.params.openAlexFilter || '',
      now,
    });
  }
  const topicId = source.id.startsWith('openalex-topic-')
    ? source.id.slice('openalex-topic-'.length)
    : undefined;
  return emptyAim({
    id: topicId ? `topic:${topicId}` : source.id,
    kind: 'topic',
    name: source.name,
    topicId,
    openAlexFilter: source.params.openAlexFilter || (topicId ? `topics.id:${topicId}` : ''),
    now,
  });
}

function emptyAim(args: {
  id: string;
  kind: Aim['kind'];
  name: string;
  topicId?: string;
  openAlexFilter: string;
  now: number;
}): Aim {
  return {
    id: args.id,
    kind: args.kind,
    name: args.name,
    topicId: args.topicId,
    openAlexFilter: args.openAlexFilter,
    leftoverIds: [],
    leftoverCards: [],
    pool: 'recent',
    lastFetchAt: null,
    lastFetchOk: false,
    updatedAt: args.now,
  };
}

function pairLeftover(ids: string[], cards: PaperCard[]): { leftoverIds: string[]; leftoverCards: PaperCard[] } {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const leftoverIds: string[] = [];
  const leftoverCards: PaperCard[] = [];
  for (const id of ids) {
    const card = byId.get(id);
    if (card) {
      leftoverIds.push(id);
      leftoverCards.push(card);
    }
  }
  return { leftoverIds, leftoverCards };
}

function writeLeftoverFields(
  leftoverIds: string[],
  leftoverCards: PaperCard[],
): { leftoverIds: string[]; leftoverCards: PaperCard[] } {
  const paired = pairLeftover(leftoverIds, leftoverCards);
  if (paired.leftoverIds.some((id, i) => paired.leftoverCards[i]?.id !== id)) {
    throw new Error('leftoverCards[i].id must equal leftoverIds[i]');
  }
  return paired;
}

export function shouldFirstFetch(aim: Aim): boolean {
  return aim.lastFetchAt === null;
}

export async function listAims(): Promise<Aim[]> {
  return db.aims.toArray();
}

export async function getAim(id: string): Promise<Aim | undefined> {
  return db.aims.get(id);
}

export async function upsertAim(aim: Aim): Promise<void> {
  const leftover = writeLeftoverFields(aim.leftoverIds, aim.leftoverCards);
  await db.aims.put({ ...aim, ...leftover, updatedAt: Date.now() });
}

export async function parkAim(id: string, leftoverIds: string[], leftoverCards: PaperCard[]): Promise<void> {
  const leftover = writeLeftoverFields(leftoverIds, leftoverCards);
  const existing = await db.aims.get(id);
  if (!existing) return;
  await db.aims.update(id, { ...leftover, updatedAt: Date.now() });
}

export async function restoreAim(id: string): Promise<Aim | undefined> {
  const aim = await db.aims.get(id);
  if (!aim) return undefined;
  return evictOneAim(aim);
}

async function evictOneAim(aim: Aim): Promise<Aim> {
  const saved = new Set((await db.savedPapers.toArray()).map((paper) => paper.id));
  const discarded = new Set((await db.discardedIds.toArray()).map((row) => row.id));
  const leftoverIds = aim.leftoverIds.filter((id) => !saved.has(id) && !discarded.has(id));
  const leftover = writeLeftoverFields(leftoverIds, aim.leftoverCards);
  if (
    leftover.leftoverIds.length !== aim.leftoverIds.length ||
    leftover.leftoverIds.some((id, i) => id !== aim.leftoverIds[i])
  ) {
    const next: Aim = { ...aim, ...leftover, updatedAt: Date.now() };
    await db.aims.put(next);
    return next;
  }
  return { ...aim, ...leftover };
}

export async function evictJournaledFromLeftovers(): Promise<void> {
  const aims = await db.aims.toArray();
  for (const aim of aims) {
    await evictOneAim(aim);
  }
}

export async function dropFromLeftover(aimId: string, paperId: string): Promise<void> {
  const aim = await db.aims.get(aimId);
  if (!aim) return;
  const leftoverIds = aim.leftoverIds.filter((id) => id !== paperId);
  const leftover = writeLeftoverFields(leftoverIds, aim.leftoverCards);
  await db.aims.update(aimId, { ...leftover, updatedAt: Date.now() });
}

export async function replaceLeftover(
  aimId: string,
  cards: PaperCard[],
  lastFetchOk: boolean,
): Promise<Aim> {
  const leftover = writeLeftoverFields(cards.map((card) => card.id), cards);
  const existing = await db.aims.get(aimId);
  if (!existing) {
    throw new Error(`unknown aim ${aimId}`);
  }
  const next: Aim = {
    ...existing,
    ...leftover,
    lastFetchAt: Date.now(),
    lastFetchOk,
    updatedAt: Date.now(),
  };
  await db.aims.put(next);
  return next;
}

export async function markFetchFailed(aimId: string): Promise<Aim | undefined> {
  const existing = await db.aims.get(aimId);
  if (!existing) return undefined;
  const next: Aim = {
    ...existing,
    lastFetchAt: Date.now(),
    lastFetchOk: false,
    updatedAt: Date.now(),
  };
  await db.aims.put(next);
  return next;
}

export async function prependRefresh(aimId: string, newer: PaperCard[]): Promise<Aim> {
  const aim = await db.aims.get(aimId);
  if (!aim) throw new Error(`unknown aim ${aimId}`);
  const existing = new Set(aim.leftoverIds);
  const incoming = newer.filter((card) => !existing.has(card.id));
  const leftoverCards = [...incoming, ...aim.leftoverCards];
  return replaceLeftover(aimId, leftoverCards, true);
}

export async function replaceStackForPoolFlip(aimId: string, pool: Pool, cards: PaperCard[]): Promise<Aim> {
  const leftover = writeLeftoverFields(cards.map((card) => card.id), cards);
  const existing = await db.aims.get(aimId);
  if (!existing) throw new Error(`unknown aim ${aimId}`);
  const next: Aim = {
    ...existing,
    ...leftover,
    pool,
    lastFetchAt: Date.now(),
    lastFetchOk: true,
    updatedAt: Date.now(),
  };
  await db.aims.put(next);
  return next;
}

export async function ensureGlobalRecent(): Promise<Aim> {
  const existing = await db.aims.get('global-recent');
  if (existing) return existing;
  const aim = emptyAim({
    id: 'global-recent',
    kind: 'global-recent',
    name: 'Global Recent',
    openAlexFilter: '',
    now: Date.now(),
  });
  await db.aims.put(aim);
  return aim;
}

export async function ensureTopicAim(topicId: string, name: string): Promise<Aim> {
  const id = `topic:${topicId}`;
  const existing = await db.aims.get(id);
  if (existing) return existing;
  const aim = emptyAim({
    id,
    kind: 'topic',
    name,
    topicId,
    openAlexFilter: `topics.id:${topicId}`,
    now: Date.now(),
  });
  await db.aims.put(aim);
  return aim;
}
