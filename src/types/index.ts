export type RepositoryType = 'openalex';

export interface AuthorAffiliation {
  name: string;
  institution: string;
  countryCode: string;
}

export interface PaperCard {
  id: string;               // Unique: e.g. "openalex:W12345"
  source: string;           // Display label (e.g. "OpenAlex (AI & ML)")
  sourceType: RepositoryType;
  title: string;
  abstract: string;
  authors: string[];
  publishedDate: string;
  url: string;              // Publisher/Landing page
  pdfUrl?: string;          // Direct PDF stream link
  doi?: string;
  tags: string[];
  hasContent?: boolean;
  hasGrobidXml?: boolean;
  unreadable?: boolean;
  unreadableStampedAt?: number;
  updatedAt?: number;

  // Contextual Metadata
  citationCount?: number;
  fwci?: number;
  documentType?: string;
  oaStatus?: string;
  primaryInstitution?: string;
  primaryInstitutionCountry?: string;
  funders?: string[];
  sdgs?: string[];
  isRetracted?: boolean;
  referencedWorksCount?: number;
  fullAuthorships?: AuthorAffiliation[];
}

export interface PaperNote {
  id: string;               // UUID
  paperId: string;          // Reference to PaperCard.id
  takeaways: string;
  jargonTerms: Array<{ term: string; explanation: string; timestamp: number }>;
  synthesis: string;
  quotes: Array<{ text: string; pageNumber?: number; createdAt: number }>;
  createdAt: number;
  updatedAt: number;
}

export interface CachedPdf {
  paperId: string;          // Unique key matching PaperCard.id
  blob: Blob;               // Stored binary PDF file
  cachedAt: number;         // Timestamp when cached
  sizeBytes: number;        // Size of the binary file
}

export interface CachedContent {
  paperId: string;
  xmlText: string;
  cachedAt: number;
  sizeBytes: number;
}

export interface RepositoryConfig {
  id: string;
  name: string;
  type: RepositoryType;
  enabled: boolean;
  category: string;
  params: {
    queryKeywords?: string;
    openAlexFilter?: string;
  };
}

export interface TextSelectionContext {
  text: string;
  context: string;
  rect: DOMRect;
}

export type AimKind = 'global-recent' | 'topic';
export type Pool = 'recent' | 'cited';

export interface Aim {
  id: string;
  kind: AimKind;
  name: string;
  topicId?: string;
  openAlexFilter: string;
  leftoverIds: string[];
  leftoverCards: PaperCard[];
  pool: Pool;
  lastFetchAt: number | null;
  lastFetchOk: boolean;
  updatedAt: number;
}

export interface ParagraphPlace {
  sectionIndex: number;
  paragraphIndex: number;
  textPrefix: string;
}

export interface ReadingPlaceRow {
  paperId: string;
  place: ParagraphPlace | null;
  updatedAt: number;
}

export interface JournalTombstone {
  id: string;
  deletedAt: number;
}

export type PileStatus = 'ready' | 'failed' | 'quota' | 'caught_up';

export class FeedError extends Error {
  constructor(
    message: string,
    readonly kind: 'quota' | 'transient',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FeedError';
  }
}

export function isFeedError(err: unknown): err is FeedError {
  return err instanceof FeedError;
}

export interface ParsedSection {
  heading: string;
  paragraphs: string[];
}

export interface ContentResult {
  abstract?: string;
  sections: ParsedSection[];
}

export type ContentFetchResult =
  | { ok: true; kind: 'ok'; content: ContentResult }
  | { ok: false; kind: 'not_found'; status?: number }
  | { ok: false; kind: 'quota'; status: 429 }
  | { ok: false; kind: 'transient'; status?: number; message: string };

/** Works hint only: no GROBID XML advertised, and we have never confirmed a not_found fetch. */
export function isHintOnly(paper: Pick<PaperCard, 'hasGrobidXml' | 'unreadableStampedAt'>): boolean {
  return paper.hasGrobidXml === false && paper.unreadableStampedAt == null;
}

/** Visible mark on deck / journal / reader. Missing hasGrobidXml (old rows) stays unmarked until a stamp. */
export function showsNoInAppText(paper: Pick<PaperCard, 'unreadable' | 'hasGrobidXml'>): boolean {
  return paper.unreadable === true || paper.hasGrobidXml === false;
}

export function publisherUrl(paper: Pick<PaperCard, 'url'>): string | null {
  const url = paper.url?.trim();
  return url ? url : null;
}

export type UnreadableStampPatch = Pick<
  PaperCard,
  'unreadable' | 'unreadableStampedAt' | 'hasGrobidXml' | 'updatedAt'
>;

export function isRealMark(
  note: Pick<PaperNote, 'takeaways' | 'synthesis' | 'quotes' | 'jargonTerms'>,
): boolean {
  return (
    note.takeaways.trim().length > 0 ||
    note.synthesis.trim().length > 0 ||
    note.quotes.length > 0 ||
    note.jargonTerms.length > 0
  );
}
