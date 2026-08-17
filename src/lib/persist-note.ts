import { db } from './db';
import { dropFromLeftover, getActiveAimId, getAim } from '../services/aim-store';
import { isRealMark, PaperCard, PaperNote } from '../types';

export type PersistNoteResult =
  | { ok: true; impliedSave: boolean }
  | { ok: false };

/**
 * Write the note immediately. First real mark puts the paper in the journal
 * (one-way) and drops it from this device's leftover. Gist push waits for the
 * journal-sync ticket.
 */
export async function persistNoteNow(note: PaperNote, paper: PaperCard): Promise<PersistNoteResult> {
  try {
    let impliedSave = false;
    await db.transaction('rw', db.notes, db.savedPapers, async () => {
      await db.notes.put(note);
      if (!isRealMark(note)) return;
      const existing = await db.savedPapers.get(paper.id);
      if (!existing) {
        await db.savedPapers.put({ ...paper, updatedAt: Date.now() });
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

    return { ok: true, impliedSave };
  } catch {
    return { ok: false };
  }
}