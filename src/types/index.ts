export type RepositoryType = 'osf' | 'zenodo' | 'arxiv' | 'figshare';

export interface PaperCard {
  id: string;               // Unique: e.g. "osf:socarxiv:123", "arxiv:2401.001"
  source: string;           // Display label (e.g. "SocArXiv", "arXiv (cs.AI)")
  sourceType: RepositoryType;
  title: string;
  abstract: string;
  authors: string[];
  publishedDate: string;
  url: string;              // Publisher/Landing page
  pdfUrl?: string;          // Direct PDF stream link
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
    osfProviderSlug?: string; // 'socarxiv', 'psyarxiv', 'mediaarxiv', 'agrixiv'
    queryKeywords?: string;
    arxivCategory?: string;   // 'cs.AI', 'physics.soc-ph', 'econ.GN'
  };
}

export interface TextSelectionContext {
  text: string;
  context: string;
  rect: DOMRect;
}
