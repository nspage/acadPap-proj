import { db } from './db';
import { dropFromLeftover, getActiveAimId, getAim } from '../services/aim-store';
import { scheduleJournalPush } from '../services/gist-sync';
import { isRealMark, PaperCard, PaperNote } from '../types';

export type PersistNoteResult =
  | { ok: true; impliedSave: boolean }
  | { ok: false };

/**
 * Write the note immediately. First real mark puts the paper in the journal
 * (one-way) and drops it from this device's leftover. Schedules a journal push.
 */
export async function persistNoteNow(note: PaperNote, paper: PaperCard): Promise<PersistNoteResult> {
  try {
    let impliedSave = false;
    await db.transaction('rw', db.notes, db.savedPapers, db.journalTombstones, async () => {
      await db.notes.put(note);
      if (!isRealMark(note)) return;
      const existing = await db.savedPapers.get(paper.id);
      if (!existing) {
        await db.savedPapers.put({ ...paper, updatedAt: Date.now() });
        await db.journalTombstones.delete(paper.id);
        impliedSave = true;
      }
    });

    if (isRealMark(note)) {
      const aimId = getActiveAimId();
      const aim = await getAim(aimId);
      if (aim?.leftoverIds.includes(paper.id)) {
        await dropFromLeftover(aimId, paper.id);
        impliedSave = true;
      }
    }

    scheduleJournalPush();
    return { ok: true, impliedSave };
  } catch (err) {
    console.error('Failed to save the note:', err);
    return { ok: false };
  }
}