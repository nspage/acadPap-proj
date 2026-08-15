export type RepositoryType = 'openalex';

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
