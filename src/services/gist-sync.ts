import { db } from '../lib/db';
import {
  clearSyncFailedOnLeave,
  didSyncFailOnLeave,
  markSyncFailedOnLeave,
} from '../lib/sync-flag';
import {
  JournalTombstone,
  PaperCard,
  PaperNote,
  ReadingPlaceRow,
} from '../types';

export const JOURNAL_SCHEMA_VERSION = 2 as const;
export const JOURNAL_PUSH_DEBOUNCE_MS = 750;
export const JOURNAL_PAYLOAD_WARN_BYTES = 1_000_000;

const RETRY_BACKOFF_MS = [5_000, 15_000, 45_000] as const;

export interface JournalSyncState {
  schemaVersion: typeof JOURNAL_SCHEMA_VERSION;
  savedPapers: PaperCard[];
  notes: PaperNote[];
  discardedIds: Array<{ id: string; discardedAt: number }>;
  readingPlaces: ReadingPlaceRow[];
  tombstones: JournalTombstone[];
  lastSyncedAt: number;
}

export function getJournalCreds(): { pat: string; gistId: string } | null {
  try {
    const pat = localStorage.getItem('github_pat')?.trim() || '';
    const gistId = localStorage.getItem('gist_id')?.trim() || '';
    if (!pat || !gistId) return null;
    return { pat, gistId };
  } catch {
    return null;
  }
}

export function remoteWins(
  remoteUpdatedAt: number | undefined,
  localUpdatedAt: number | undefined,
): boolean {
  if (localUpdatedAt == null) return true;
  return (remoteUpdatedAt ?? 0) >= localUpdatedAt;
}

export function tombstoneApplies(
  deletedAt: number,
  localUpdatedAt: number | undefined,
): boolean {
  return localUpdatedAt == null || deletedAt >= localUpdatedAt;
}

export function parseJournalState(raw: unknown): JournalSyncState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.savedPapers) && !Array.isArray(o.notes) && !Array.isArray(o.discardedIds)) {
    if (o.schemaVersion !== JOURNAL_SCHEMA_VERSION && !Array.isArray(o.readingPlaces) && !Array.isArray(o.tombstones)) {
      return null;
    }
  }
  return {
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    savedPapers: Array.isArray(o.savedPapers) ? (o.savedPapers as PaperCard[]) : [],
    notes: Array.isArray(o.notes) ? (o.notes as PaperNote[]) : [],
    discardedIds: Array.isArray(o.discardedIds)
      ? (o.discardedIds as Array<{ id: string; discardedAt: number }>)
      : [],
    readingPlaces: Array.isArray(o.readingPlaces) ? (o.readingPlaces as ReadingPlaceRow[]) : [],
    tombstones: Array.isArray(o.tombstones)
      ? (o.tombstones as JournalTombstone[])
      : [],
    lastSyncedAt: typeof o.lastSyncedAt === 'number' ? o.lastSyncedAt : 0,
  };
}

export function journalPayloadOmitsSources(payload: string): boolean {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return !Object.prototype.hasOwnProperty.call(parsed, 'sources');
  } catch {
    return false;
  }
}

let dirty = false;
let lastFailed = false;
let lastPushOversize = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryIndex = 0;
let inFlight: Promise<boolean> | null = null;

export function journalIsDirty(): boolean {
  return dirty;
}

export function lastJournalPushFailed(): boolean {
  return lastFailed;
}

export function lastJournalPushMayTruncate(): boolean {
  return lastPushOversize;
}

export function scheduleJournalPush(): void {
  dirty = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runPush({ fromSchedule: true });
  }, JOURNAL_PUSH_DEBOUNCE_MS);
}

export async function flushJournalPush(): Promise<boolean> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  stopRetry();

  if (!getJournalCreds()) return true;
  if (!dirty && !lastFailed) return true;

  const alreadyFailed = didSyncFailOnLeave();
  if (dirty) markSyncFailedOnLeave();

  const ok = await runPush({ fromSchedule: false });
  if (ok && !alreadyFailed) clearSyncFailedOnLeave();
  if (!ok) markSyncFailedOnLeave();
  return ok;
}

async function runPush(opts: { fromSchedule: boolean }): Promise<boolean> {
  const creds = getJournalCreds();
  if (!creds) return true;

  if (inFlight) {
    const ok = await inFlight;
    if (!opts.fromSchedule && dirty) return runPush(opts);
    return ok;
  }

  inFlight = pushStateToGist(creds.pat, creds.gistId);
  let ok = false;
  try {
    ok = await inFlight;
  } finally {
    inFlight = null;
  }

  if (ok) {
    dirty = false;
    lastFailed = false;
    retryIndex = 0;
    stopRetry();
    return true;
  }

  lastFailed = true;
  if (opts.fromSchedule && isDocumentVisible()) startRetry();
  return false;
}

function startRetry(): void {
  stopRetry();
  const delay = RETRY_BACKOFF_MS[Math.min(retryIndex, RETRY_BACKOFF_MS.length - 1)];
  retryIndex += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (!isDocumentVisible()) return;
    if (!dirty && !lastFailed) return;
    void runPush({ fromSchedule: true });
  }, delay);
}

function stopRetry(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

async function readJournalSnapshot(): Promise<JournalSyncState> {
  const now = Date.now();
  const [savedPapers, notes, discardedIds, readingPlaces, tombstones] = await Promise.all([
    db.savedPapers.toArray(),
    db.notes.toArray(),
    db.discardedIds.toArray(),
    db.readingPlaces.toArray(),
    db.journalTombstones.toArray(),
  ]);

  return {
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    savedPapers: savedPapers.map((paper) => ({
      ...paper,
      updatedAt: paper.updatedAt ?? now,
    })),
    notes: notes.map((note) => ({
      ...note,
      updatedAt: note.updatedAt ?? now,
    })),
    discardedIds,
    readingPlaces: readingPlaces.map((row) => ({
      ...row,
      updatedAt: row.updatedAt ?? now,
    })),
    tombstones,
    lastSyncedAt: now,
  };
}

/**
 * Pushes the journal snapshot only. Must not read `sources` or `aims`.
 */
export async function pushStateToGist(pat: string, gistId: string): Promise<boolean> {
  if (!pat || !gistId) return false;

  try {
    const state = await readJournalSnapshot();
    const payload = JSON.stringify(state);
    if (!journalPayloadOmitsSources(payload)) return false;

    lastPushOversize = new TextEncoder().encode(payload).length > JOURNAL_PAYLOAD_WARN_BYTES;

    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: {
          'state.json': {
            content: payload,
          },
        },
      }),
    });

    if (!res.ok) {
      console.error('Failed to sync the journal:', res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to sync the journal:', err);
    return false;
  }
}

/**
 * Pulls journal state and last-write-wins merges it. Ignores `sources`.
 * Caller must run `evictJournaledFromLeftovers` after a successful pull.
 */
export async function pullStateFromGist(pat: string, gistId: string): Promise<boolean> {
  if (!pat || !gistId) return false;

  try {
    const text = await fetchJournalFile(pat, gistId);
    if (text === null) {
      console.error('Failed to load the journal: empty or unusable gist file');
      return false;
    }
    if (text === '') return true;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.error('Failed to load the journal: parse error', err);
      return false;
    }

    const state = parseJournalState(parsed);
    if (!state) {
      console.error('Failed to load the journal: unusable state');
      return false;
    }

    const keptLocalNewer = await mergeJournalState(state);
    if (keptLocalNewer) scheduleJournalPush();
    return true;
  } catch (err) {
    console.error('Failed to load the journal:', err);
    return false;
  }
}

async function fetchJournalFile(pat: string, gistId: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${pat}`,
    },
  });
  if (!res.ok) return null;

  const gist = (await res.json()) as {
    files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string } | undefined>;
  };
  const file = gist.files?.['state.json'];
  if (!file) return '';

  if (file.truncated) {
    if (!file.raw_url) return null;
    const raw = await fetch(file.raw_url, {
      headers: { Authorization: `token ${pat}` },
    });
    if (!raw.ok) return null;
    return raw.text();
  }

  return file.content ?? '';
}

async function mergeJournalState(state: JournalSyncState): Promise<boolean> {
  let keptLocalNewer = false;
  const now = Date.now();

  await db.transaction(
    'rw',
    [
      db.savedPapers,
      db.notes,
      db.discardedIds,
      db.readingPlaces,
      db.journalTombstones,
      db.contentCache,
      db.pdfCache,
    ],
    async () => {
      const [localSaved, localNotes, localPlaces] = await Promise.all([
        db.savedPapers.toArray(),
        db.notes.toArray(),
        db.readingPlaces.toArray(),
      ]);

      for (const paper of localSaved) {
        if (paper.updatedAt == null) {
          await db.savedPapers.update(paper.id, { updatedAt: now });
          paper.updatedAt = now;
        }
      }
      for (const note of localNotes) {
        if (note.updatedAt == null) {
          await db.notes.update(note.id, { updatedAt: now });
          note.updatedAt = now;
        }
      }
      for (const row of localPlaces) {
        if (row.updatedAt == null) {
          await db.readingPlaces.update(row.paperId, { updatedAt: now });
          row.updatedAt = now;
        }
      }

      const savedById = new Map(localSaved.map((row) => [row.id, row]));
      const notesById = new Map(localNotes.map((row) => [row.id, row]));
      const placesById = new Map(localPlaces.map((row) => [row.paperId, row]));

      for (const remote of state.savedPapers) {
        const local = savedById.get(remote.id);
        if (remoteWins(remote.updatedAt, local?.updatedAt)) {
          await db.savedPapers.put({ ...remote, updatedAt: remote.updatedAt ?? now });
        } else {
          keptLocalNewer = true;
        }
      }

      for (const remote of state.notes) {
        const local = notesById.get(remote.id);
        if (remoteWins(remote.updatedAt, local?.updatedAt)) {
          await db.notes.put({ ...remote, updatedAt: remote.updatedAt ?? now });
        } else {
          keptLocalNewer = true;
        }
      }

      for (const remote of state.readingPlaces) {
        const local = placesById.get(remote.paperId);
        if (remoteWins(remote.updatedAt, local?.updatedAt)) {
          await db.readingPlaces.put({ ...remote, updatedAt: remote.updatedAt ?? now });
        } else {
          keptLocalNewer = true;
        }
      }

      if (state.discardedIds.length > 0) {
        await db.discardedIds.bulkPut(state.discardedIds);
      }

      for (const tombstone of state.tombstones) {
        const local = savedById.get(tombstone.id) ?? (await db.savedPapers.get(tombstone.id));
        if (!tombstoneApplies(tombstone.deletedAt, local?.updatedAt)) {
          keptLocalNewer = true;
          continue;
        }
        await db.savedPapers.delete(tombstone.id);
        await db.notes.where('paperId').equals(tombstone.id).delete();
        await db.readingPlaces.delete(tombstone.id);
        await db.contentCache.delete(tombstone.id);
        await db.pdfCache.delete(tombstone.id);
        await db.journalTombstones.put(tombstone);
      }
    },
  );

  return keptLocalNewer;
}
