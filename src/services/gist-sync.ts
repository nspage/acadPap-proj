import { db } from '../lib/db';

export interface SyncState {
  savedPapers: any[];
  notes: any[];
  sources: any[];
  discardedIds: any[];
  lastSyncedAt: number;
}

/**
 * Pushes the lightweight IndexedDB tables to a GitHub Gist.
 */
export async function pushStateToGist(pat: string, gistId: string): Promise<boolean> {
  if (!pat || !gistId) return false;

  try {
    const state: SyncState = {
      savedPapers: await db.savedPapers.toArray(),
      notes: await db.notes.toArray(),
      sources: await db.sources.toArray(),
      discardedIds: await db.discardedIds.toArray(),
      lastSyncedAt: Date.now(),
    };

    const payload = JSON.stringify(state, null, 2);

    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: {
          'state.json': {
            content: payload
          }
        }
      })
    });

    if (!res.ok) {
      console.error('Failed to push state to Gist', await res.text());
      return false;
    }
    
    console.log(`[Cloud Sync] Successfully pushed state to Gist at ${new Date().toLocaleTimeString()}`);
    return true;
  } catch (err) {
    console.error('Error pushing state to gist:', err);
    return false;
  }
}

/**
 * Pulls the JSON state from a GitHub Gist and cleanly merges it into the local IndexedDB.
 */
export async function pullStateFromGist(pat: string, gistId: string): Promise<boolean> {
  if (!pat || !gistId) return false;

  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${pat}`,
      }
    });

    if (!res.ok) {
      console.error('Failed to pull state from Gist', await res.text());
      return false;
    }

    const gist = await res.json();
    const file = gist.files['state.json'];
    if (!file || !file.content) return false;

    const state: SyncState = JSON.parse(file.content);

    // Merge into local IndexedDB
    // We use bulkPut which performs an upsert (insert or replace).
    // This safely merges cloud state over local state.
    
    await db.transaction('rw', [db.savedPapers, db.notes, db.sources, db.discardedIds], async () => {
      if (state.savedPapers?.length) await db.savedPapers.bulkPut(state.savedPapers);
      if (state.notes?.length) await db.notes.bulkPut(state.notes);
      if (state.sources?.length) await db.sources.bulkPut(state.sources);
      if (state.discardedIds?.length) await db.discardedIds.bulkPut(state.discardedIds);
    });

    console.log(`[Cloud Sync] Successfully pulled and merged state from Gist.`);
    return true;
  } catch (err) {
    console.error('Error pulling state from gist:', err);
    return false;
  }
}
