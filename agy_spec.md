# Product Specification: Academic Serendipity Reader (PWA)

## 1. System Architecture & Critical Constraints

### 1.1 CORS & Edge Proxy Architecture
- **Problem:** arXiv (`export.arxiv.org`), OSF, and publisher PDF hosts do not serve permissive CORS headers to client browsers. Public proxies (`allorigins`, `corsproxy`) are insecure, untrusted, rate-limited, and truncate binary PDF streams.
- **Solution:** All non-CORS network requests route through an edge proxy endpoint (`/api/proxy?url=...`).
  - **In Development:** Vite dev server middleware handles `/api/proxy` by proxying the request server-side.
  - **In Production:** Cloudflare Workers or Vercel Edge Functions handle `/api/proxy`, stripping CORS restrictions and piping raw streams (JSON & binary PDF buffers) with `Access-Control-Allow-Origin: *`.

### 1.2 Hybrid Offline Caching Architecture
- **Metadata Tier:** All fetched paper cards (titles, abstracts, authors, tags) are automatically stored in IndexedDB (`savedPapers` & `discardedIds`) via Dexie.
- **Binary PDF Tier:** To avoid mobile browser storage evictions from bulk PDF downloads during swipe discovery, PDF binaries (`Blob` / `ArrayBuffer`) are selectively downloaded and cached in IndexedDB (`pdfCache` table) when a user saves a paper or swipes right.
- **Deep Reader Resolution:** The reader first checks `pdfCache` for a stored `Blob`. If present, it loads the PDF offline. If absent, it streams the PDF via `/api/proxy` and offers a single-click "Cache for Offline" button.

### 1.3 Local PDF Worker & Reader Virtualization
- **Bundled Worker:** PDF.js worker is imported directly as a local Vite asset (`pdfjs-dist/build/pdf.worker.min.mjs?url`), guaranteeing complete offline operation without unpkg/CDN dependencies.
- **Virtualized Single-Page View:** Instead of eagerly rendering all pages (causing mobile DOM crash and memory spikes), the reader renders pages on demand with pagination controls and viewport virtualization.
- **Robust Context Extraction:** Context text selection grabs surrounding characters ($\pm 250$ chars) from `.react-pdf__Page__textContent` rather than fragile `closest('p')` DOM lookups on absolute `<span>` elements.

---

## 2. Dependencies (`package.json`)

```json
{
  "name": "academic-serendipity-reader",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@google/genai": "^0.1.1",
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-popover": "^1.1.2",
    "@radix-ui/react-tabs": "^1.1.1",
    "clsx": "^2.1.1",
    "dexie": "^4.0.8",
    "dexie-react-hooks": "^1.1.7",
    "fast-xml-parser": "^4.5.0",
    "framer-motion": "^11.11.17",
    "lucide-react": "^0.460.0",
    "pdfjs-dist": "^4.8.69",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-pdf": "^9.1.1",
    "tailwind-merge": "^2.5.4"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "typescript": "~5.6.2",
    "vite": "^5.4.10",
    "vite-plugin-pwa": "^0.20.5"
  }
}
```

---

## 3. Data Contracts (`src/types/index.ts`)

```typescript
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
  surroundingContext: string;
  rect: DOMRect;
}
```

---

## 4. Local-First Database (`src/lib/db.ts`)

```typescript
import Dexie, { type EntityTable } from 'dexie';
import { PaperCard, PaperNote, RepositoryConfig, CachedPdf } from '../types';

export const db = new Dexie('AcademicSerendipityDB') as Dexie & {
  savedPapers: EntityTable<PaperCard, 'id'>;
  notes: EntityTable<PaperNote, 'id'>;
  sources: EntityTable<RepositoryConfig, 'id'>;
  discardedIds: EntityTable<{ id: string; discardedAt: number }, 'id'>;
  pdfCache: EntityTable<CachedPdf, 'paperId'>;
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
    id: 'osf-socarxiv',
    name: 'SocArXiv (Social Sciences)',
    type: 'osf',
    enabled: true,
    category: 'Social Sciences',
    params: { osfProviderSlug: 'socarxiv' }
  },
  {
    id: 'osf-psyarxiv',
    name: 'PsyArXiv (Psychology)',
    type: 'osf',
    enabled: true,
    category: 'Psychology',
    params: { osfProviderSlug: 'psyarxiv' }
  },
  {
    id: 'arxiv-ai',
    name: 'arXiv (AI & ML)',
    type: 'arxiv',
    enabled: true,
    category: 'Computer Science',
    params: { arxivCategory: 'cs.AI' }
  },
  {
    id: 'zenodo-open',
    name: 'Zenodo (Open Science)',
    type: 'zenodo',
    enabled: true,
    category: 'Interdisciplinary',
    params: { queryKeywords: 'open science' }
  }
];

export async function initializeDatabase() {
  const count = await db.sources.count();
  if (count === 0) {
    await db.sources.bulkAdd(DEFAULT_SOURCES);
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
```

---

## 5. Network & Proxy Utilities (`src/lib/proxy.ts`)

```typescript
/**
 * Routes external API or PDF stream fetches through the edge proxy endpoint (/api/proxy).
 * In development, Vite dev server proxies /api/proxy server-side.
 * In production, Edge Function / Worker strips CORS and pipes raw headers.
 */
export async function fetchWithCORSProxy(targetUrl: string, init?: RequestInit): Promise<Response> {
  try {
    const directRes = await fetch(targetUrl, init);
    if (directRes.ok) return directRes;
  } catch {
    // Direct call failed due to CORS restriction, fallback to Edge Proxy
  }

  const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  return fetch(proxyUrl, init);
}
```

---

## 6. Repository Adapters (`src/services/adapters/`)

### 6.1 OSF Preprints (`src/services/adapters/osf.ts`)

```typescript
import { PaperCard, RepositoryConfig } from '../../types';
import { fetchWithCORSProxy } from '../../lib/proxy';

export async function fetchOSFPapers(config: RepositoryConfig, page = 1): Promise<PaperCard[]> {
  const slug = config.params.osfProviderSlug || 'socarxiv';
  const query = config.params.queryKeywords 
    ? `&filter[title,description]=${encodeURIComponent(config.params.queryKeywords)}` 
    : '';
  
  const endpoint = `https://api.osf.io/v2/preprints/?filter[provider]=${slug}${query}&page=${page}&page[size]=15&embed=bibliographic_contributors`;
  const res = await fetchWithCORSProxy(endpoint);
  if (!res.ok) throw new Error(`OSF error: ${res.status}`);
  const json = await res.json();

  return (json.data || []).map((item: any) => {
    const landingUrl = item.links?.html || `https://osf.io/preprints/${slug}/${item.id}`;
    // Directly resolve OSF binary download URL instead of doi redirect link
    const pdfUrl = `${landingUrl}/download`;

    return {
      id: `osf:${slug}:${item.id}`,
      source: config.name,
      sourceType: 'osf',
      title: item.attributes?.title || 'Untitled',
      abstract: (item.attributes?.description || 'No abstract provided.').trim(),
      authors: item.embeds?.bibliographic_contributors?.data?.map(
        (c: any) => c.embeds?.users?.data?.attributes?.full_name || c.attributes?.bibliographic_name || 'Unknown'
      ) || ['Unknown'],
      publishedDate: item.attributes?.date_published || item.attributes?.date_created || '',
      url: landingUrl,
      pdfUrl,
      tags: item.attributes?.tags || []
    };
  });
}
```

### 6.2 arXiv Adapter (`src/services/adapters/arxiv.ts`)

```typescript
import { XMLParser } from 'fast-xml-parser';
import { PaperCard, RepositoryConfig } from '../../types';
import { fetchWithCORSProxy } from '../../lib/proxy';

export async function fetchArxivPapers(config: RepositoryConfig, page = 1): Promise<PaperCard[]> {
  const start = (page - 1) * 15;
  const category = config.params.arxivCategory || 'cs.AI';
  const url = `https://export.arxiv.org/api/query?search_query=cat:${category}&start=${start}&max_results=15&sortBy=submittedDate&sortOrder=descending`;

  const res = await fetchWithCORSProxy(url);
  if (!res.ok) throw new Error(`arXiv error: ${res.status}`);
  const xmlData = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const parsed = parser.parse(xmlData);
  const entries = Array.isArray(parsed.feed?.entry) 
    ? parsed.feed.entry 
    : parsed.feed?.entry ? [parsed.feed.entry] : [];

  return entries.map((entry: any) => {
    const rawId = entry.id || '';
    const arxivId = rawId.split('/abs/').pop() || rawId;
    
    let pdfUrl: string | undefined;
    if (Array.isArray(entry.link)) {
      const pdfLink = entry.link.find((l: any) => l['@_title'] === 'pdf' || l['@_type'] === 'application/pdf');
      pdfUrl = pdfLink ? pdfLink['@_href'] : undefined;
    }

    const authors = Array.isArray(entry.author)
      ? entry.author.map((a: any) => a.name)
      : entry.author ? [entry.author.name] : ['Unknown'];

    return {
      id: `arxiv:${arxivId}`,
      source: config.name,
      sourceType: 'arxiv',
      title: (entry.title || '').replace(/\s+/g, ' ').trim(),
      abstract: (entry.summary || '').replace(/\s+/g, ' ').trim(),
      authors,
      publishedDate: entry.published?.split('T')[0] || '',
      url: rawId,
      pdfUrl: pdfUrl || `https://arxiv.org/pdf/${arxivId}.pdf`,
      tags: [category]
    };
  });
}
```

### 6.3 Zenodo Adapter (`src/services/adapters/zenodo.ts`)

```typescript
import { PaperCard, RepositoryConfig } from '../../types';
import { fetchWithCORSProxy } from '../../lib/proxy';

export async function fetchZenodoPapers(config: RepositoryConfig, page = 1): Promise<PaperCard[]> {
  const query = encodeURIComponent(config.params.queryKeywords || 'open access');
  const url = `https://zenodo.org/api/records?q=${query}&size=15&page=${page}&sort=mostrecent`;

  const res = await fetchWithCORSProxy(url);
  if (!res.ok) throw new Error(`Zenodo error: ${res.status}`);
  const json = await res.json();

  return (json.hits?.hits || []).map((hit: any) => ({
    id: `zenodo:${hit.id}`,
    source: config.name,
    sourceType: 'zenodo',
    title: hit.metadata?.title || 'Untitled',
    abstract: (hit.metadata?.description || '').replace(/<[^>]*>?/gm, '').trim(),
    authors: (hit.metadata?.creators || []).map((c: any) => c.name),
    publishedDate: hit.metadata?.publication_date || '',
    url: hit.links?.html || `https://zenodo.org/records/${hit.id}`,
    pdfUrl: hit.files?.find((f: any) => f.type === 'pdf' || f.key?.endsWith('.pdf'))?.links?.self,
    tags: hit.metadata?.keywords || []
  }));
}
```

---

## 7. Deep-Reader & Explainer Services (`src/services/explainer.ts`)

```typescript
import { GoogleGenAI } from '@google/genai';

export async function fetchDictionaryDefinition(term: string): Promise<string> {
  const clean = term.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 'Invalid selection.';
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${clean}`);
    if (!res.ok) return 'No standard dictionary definition found.';
    const data = await res.json();
    return data[0]?.meanings[0]?.definitions[0]?.definition || 'Definition unavailable.';
  } catch {
    return 'Unable to connect to dictionary service.';
  }
}

export async function fetchContextualExplanation(
  term: string,
  surroundingContext: string,
  apiKey: string
): Promise<string> {
  if (!apiKey) {
    return 'Add your free Gemini API key in Settings to activate context-aware explanations.';
  }
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an academic learning assistant. Explain what the term/phrase "${term}" means in the context of this excerpt:\n\n"${surroundingContext}"\n\nExplain it clearly in 2 concise, plain-English sentences.`
    });
    return response.text || 'No explanation generated.';
  } catch (err: any) {
    return `AI Explanation error: ${err.message || 'Check your API key.'}`;
  }
}
```

---

## 8. In-App PDF Reader Component (`src/components/reader/PDFViewer.tsx`)

```typescript
import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getCachedPaperPdf, cachePaperPdf } from '../../lib/db';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';

// Local Vite asset import ensures complete offline PWA operation
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PDFViewerProps {
  paperId: string;
  url: string;
  onTextSelected: (selection: { text: string; context: string; rect: DOMRect }) => void;
}

export function PDFViewer({ paperId, url, onTextSelected }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfSource, setPdfSource] = useState<string | Blob>(url);
  const [isCached, setIsCached] = useState<boolean>(false);
  const [isCaching, setIsCaching] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    getCachedPaperPdf(paperId).then((cachedBlob) => {
      if (!active) return;
      if (cachedBlob) {
        setPdfSource(cachedBlob);
        setIsCached(true);
      } else {
        // Stream through CORS proxy if not cached locally
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        setPdfSource(proxyUrl);
        setIsCached(false);
      }
    });
    return () => { active = false; };
  }, [paperId, url]);

  const handleCacheToggle = async () => {
    if (isCached || isCaching) return;
    setIsCaching(true);
    try {
      const blob = await cachePaperPdf(paperId, url);
      setPdfSource(blob);
      setIsCached(true);
    } catch (err) {
      console.error('Failed to cache PDF binary locally:', err);
    } finally {
      setIsCaching(false);
    }
  };

  const handleSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

    const selectedText = sel.toString().trim();
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Extract context string from .react-pdf__Page__textContent container
    const pageContainer = sel.anchorNode?.parentElement?.closest('.react-pdf__Page__textContent');
    const fullPageText = pageContainer?.textContent || '';
    const index = fullPageText.indexOf(selectedText);
    const start = Math.max(0, index - 250);
    const end = Math.min(fullPageText.length, index + selectedText.length + 250);
    const surroundingContext = index !== -1 ? fullPageText.slice(start, end).trim() : selectedText;

    onTextSelected({
      text: selectedText,
      context: surroundingContext,
      rect
    });
  };

  return (
    <div className="flex flex-col items-center w-full">
      {/* Reader Toolbar: Page Navigation & Offline Cache Control */}
      <div className="flex items-center justify-between w-full max-w-3xl mb-3 px-4 py-2 bg-slate-900/80 backdrop-blur rounded-lg border border-slate-800 text-sm text-slate-200">
        <div className="flex items-center space-x-2">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
          >
            Prev
          </button>
          <span>Page {currentPage} of {numPages}</span>
          <button
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
          >
            Next
          </button>
        </div>

        <button
          onClick={handleCacheToggle}
          disabled={isCached || isCaching}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            isCached 
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          {isCached ? '✓ Cached Offline' : isCaching ? 'Caching...' : 'Cache Offline'}
        </button>
      </div>

      {/* Virtualized Single-Page Viewport */}
      <div 
        className="overflow-y-auto max-h-[80vh] p-4 flex flex-col items-center w-full"
        onMouseUp={handleSelection}
        onTouchEnd={handleSelection}
      >
        <Document
          file={pdfSource}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<div className="p-8 text-slate-400">Loading PDF document...</div>}
          error={<div className="p-8 text-rose-400">Failed to render PDF in-app. Use the direct landing URL.</div>}
        >
          <Page
            pageNumber={currentPage}
            width={Math.min(window.innerWidth - 32, 750)}
            className="shadow-xl rounded"
            renderAnnotationLayer={false}
            renderTextLayer={true}
          />
        </Document>
      </div>
    </div>
  );
}
```

---

## 9. Export Utility (`src/utils/export.ts`)

```typescript
import { db } from '../lib/db';

export async function exportAllNotesAsMarkdown(): Promise<void> {
  const papers = await db.savedPapers.toArray();
  const notes = await db.notes.toArray();
  const notesMap = new Map(notes.map(n => [n.paperId, n]));

  let markdown = `# Academic Serendipity - Learning Journal\nExported: ${new Date().toLocaleDateString()}\n\n---\n\n`;

  for (const paper of papers) {
    const note = notesMap.get(paper.id);
    markdown += `## ${paper.title}\n`;
    markdown += `- **Source:** ${paper.source} ([Link](${paper.url}))\n`;
    markdown += `- **Authors:** ${paper.authors.join(', ')}\n`;
    markdown += `- **Saved Date:** ${paper.publishedDate}\n\n`;

    if (note) {
      if (note.takeaways) {
        markdown += `### Core Takeaways\n${note.takeaways}\n\n`;
      }
      if (note.jargonTerms?.length) {
        markdown += `### Jargon & Vocabulary\n`;
        note.jargonTerms.forEach(j => {
          markdown += `- **${j.term}**: ${j.explanation}\n`;
        });
        markdown += `\n`;
      }
      if (note.quotes?.length) {
        markdown += `### Captured Quotes\n`;
        note.quotes.forEach(q => {
          markdown += `> ${q.text}\n\n`;
        });
      }
      if (note.synthesis) {
        markdown += `### Personal Synthesis\n${note.synthesis}\n\n`;
      }
    }
    markdown += `---\n\n`;
  }

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `academic-notes-${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
```
