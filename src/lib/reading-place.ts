import { db } from './db';
import { scheduleJournalPush } from '../services/gist-sync';
import { ParagraphPlace } from '../types';
import { markSyncFailedOnLeave } from './sync-flag';

export {
  SYNC_FAILED_ON_LEAVE_KEY,
  clearSyncFailedOnLeave,
  didSyncFailOnLeave,
  markSyncFailedOnLeave,
} from './sync-flag';

const FIRST_VISIBLE_SLOP_PX = 8;
const TITLE_ABSTRACT_CLEAR_PX = 48;
const PREFIX_CODE_POINTS = 80;

export function normalizePrefix(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return Array.from(collapsed).slice(0, PREFIX_CODE_POINTS).join('');
}

export function readingPlaceAttr(sectionIndex: number, paragraphIndex: number): string {
  return `${sectionIndex}:${paragraphIndex}`;
}

export function parseReadingPlaceAttr(
  value: string | undefined,
): { sectionIndex: number; paragraphIndex: number } | null {
  if (!value) return null;
  const [sectionRaw, paragraphRaw] = value.split(':');
  const sectionIndex = Number(sectionRaw);
  const paragraphIndex = Number(paragraphRaw);
  if (!Number.isInteger(sectionIndex) || !Number.isInteger(paragraphIndex)) return null;
  return { sectionIndex, paragraphIndex };
}

export interface PlaceRect {
  sectionIndex: number;
  paragraphIndex: number;
  text: string;
  top: number;
  bottom: number;
}

/**
 * `undefined` — no body paragraphs; keep the prior row.
 * `null` — title and abstract still occupy the top; clear place.
 */
export function pickVisiblePlace(
  items: PlaceRect[],
  containerTop: number,
): ParagraphPlace | null | undefined {
  if (items.length === 0) return undefined;

  let firstVisibleIdx = items.findIndex((item) => item.bottom > containerTop + FIRST_VISIBLE_SLOP_PX);
  if (firstVisibleIdx === -1) firstVisibleIdx = items.length - 1;

  const firstVisible = items[firstVisibleIdx];
  if (firstVisibleIdx === 0 && firstVisible.top > containerTop + TITLE_ABSTRACT_CLEAR_PX) {
    return null;
  }

  return {
    sectionIndex: firstVisible.sectionIndex,
    paragraphIndex: firstVisible.paragraphIndex,
    textPrefix: normalizePrefix(firstVisible.text),
  };
}

export function capturePlace(container: HTMLElement): ParagraphPlace | null | undefined {
  const containerTop = container.getBoundingClientRect().top;
  const nodes = Array.from(container.querySelectorAll<HTMLElement>('p[data-reading-place]'));
  const items: PlaceRect[] = nodes.map((el) => {
    const parsed = parseReadingPlaceAttr(el.dataset.readingPlace);
    const rect = el.getBoundingClientRect();
    return {
      sectionIndex: parsed?.sectionIndex ?? 0,
      paragraphIndex: parsed?.paragraphIndex ?? 0,
      text: el.textContent ?? '',
      top: rect.top,
      bottom: rect.bottom,
    };
  });
  return pickVisiblePlace(items, containerTop);
}

export function findRestoreTarget(
  items: Array<{ sectionIndex: number; paragraphIndex: number; text: string }>,
  place: ParagraphPlace,
): number {
  const exact = items.findIndex(
    (item) =>
      item.sectionIndex === place.sectionIndex &&
      item.paragraphIndex === place.paragraphIndex &&
      normalizePrefix(item.text) === place.textPrefix,
  );
  if (exact >= 0) return exact;
  return items.findIndex((item) => normalizePrefix(item.text) === place.textPrefix);
}

export function restorePlace(container: HTMLElement, place: ParagraphPlace): void {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>('p[data-reading-place]'));
  const items = nodes.map((el) => {
    const parsed = parseReadingPlaceAttr(el.dataset.readingPlace);
    return {
      sectionIndex: parsed?.sectionIndex ?? 0,
      paragraphIndex: parsed?.paragraphIndex ?? 0,
      text: el.textContent ?? '',
    };
  });
  const idx = findRestoreTarget(items, place);
  if (idx >= 0) {
    nodes[idx].scrollIntoView({ block: 'start' });
  }
}

export async function persistPlaceNow(
  container: HTMLElement | null,
  paperId: string | null,
): Promise<boolean> {
  if (!paperId) return true;
  try {
    const saved = await db.savedPapers.get(paperId);
    if (!saved) return true;
    if (!container) return true;

    const captured = capturePlace(container);
    if (captured === undefined) return true;

    await db.readingPlaces.put({
      paperId,
      place: captured,
      updatedAt: Date.now(),
    });
    scheduleJournalPush();
    return true;
  } catch {
    markSyncFailedOnLeave();
    return false;
  }
}
