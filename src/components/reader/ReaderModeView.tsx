import { useState, useEffect } from 'react';
import { PaperCard, TextSelectionContext } from '../../types';
import { getCachedPaperPdf } from '../../lib/db';
import { pdfjs } from '../../lib/pdfWorker';
import { Type, Sparkles, BookOpen, Loader2, Calendar, User, ExternalLink } from 'lucide-react';

interface ReaderModeViewProps {
  paper: PaperCard;
  resolvedPdfUrl?: string | null;
  onTextSelected: (selection: TextSelectionContext) => void;
  onSwitchToOriginalPdf?: () => void;
}

export function ReaderModeView({ paper, resolvedPdfUrl, onTextSelected, onSwitchToOriginalPdf }: ReaderModeViewProps) {
  const [extractedPages, setExtractedPages] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');

  useEffect(() => {
    let active = true;
    setIsExtracting(true);

    async function processPdfText() {
      const activePdfUrl = resolvedPdfUrl || paper.pdfUrl;
      if (!activePdfUrl) {
        setIsExtracting(false);
        return;
      }

      try {
        let arrayBuffer: ArrayBuffer | null = null;
        const cachedBlob = await getCachedPaperPdf(paper.id);

        if (cachedBlob) {
          arrayBuffer = await cachedBlob.arrayBuffer();
        } else {
          const targetFetchUrl = activePdfUrl.includes('export.arxiv.org') || activePdfUrl.includes('unpaywall.org')
            ? activePdfUrl
            : `/api/proxy?url=${encodeURIComponent(activePdfUrl)}`;
          const res = await fetch(targetFetchUrl);
          if (res.ok) {
            arrayBuffer = await res.arrayBuffer();
          }
        }

        if (!arrayBuffer || !active) {
          setIsExtracting(false);
          return;
        }

        // Validate %PDF header magic bytes
        const header = String.fromCharCode(...new Uint8Array(arrayBuffer.slice(0, 5)));
        if (!header.startsWith('%PDF')) {
          setIsExtracting(false);
          return;
        }

        // Extract raw text using PDF.js API
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        const pagesText: string[] = [];

        for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
          if (!active) return;
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          
          let lastY: number | null = null;
          let pageStr = '';

          for (const item of content.items as any[]) {
            if (!item || typeof item.str !== 'string') continue;
            const currentY = Array.isArray(item.transform) ? item.transform[5] : null;
            
            if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 8) {
              pageStr += '\n\n';
            } else if (pageStr.length > 0 && !pageStr.endsWith(' ') && !item.str.startsWith(' ')) {
              pageStr += ' ';
            }
            pageStr += item.str;
            if (currentY !== null) {
              lastY = currentY;
            }
          }

          const cleanedText = pageStr
            .replace(/-\s+\n/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          if (cleanedText) {
            pagesText.push(cleanedText);
          }
        }

        if (active) {
          setExtractedPages(pagesText);
          setIsExtracting(false);
        }
      } catch (err: any) {
        if (!active) return;
        console.warn('Reader Mode text extraction notice:', err);
        setIsExtracting(false);
      }
    }

    processPdfText();
    return () => { active = false; };
  }, [paper.id, paper.pdfUrl, resolvedPdfUrl]);

  const handleSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

    const selectedText = sel.toString().trim();
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const container = sel.anchorNode?.parentElement?.closest('.reader-mode-content');
    const fullText = container?.textContent || '';
    const index = fullText.indexOf(selectedText);
    const start = Math.max(0, index - 250);
    const end = Math.min(fullText.length, index + selectedText.length + 250);
    const surroundingContext = index !== -1 ? fullText.slice(start, end).trim() : selectedText;

    onTextSelected({
      text: selectedText,
      context: surroundingContext,
      rect
    });
  };

  const fontClass = {
    sm: 'text-sm leading-relaxed',
    base: 'text-base leading-loose',
    lg: 'text-lg leading-loose'
  }[fontSize];

  return (
    <div className="flex flex-col items-center w-full max-w-3xl mx-auto pb-12">
      {/* Reader Mode Controls Bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between w-full px-5 py-2.5 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 text-xs text-slate-200 mb-6 shadow-xl">
        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-1 rounded-md bg-indigo-500/20 text-indigo-300 font-semibold flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Reader Mode</span>
          </span>

          {onSwitchToOriginalPdf && (
            <button
              onClick={onSwitchToOriginalPdf}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Original PDF View
            </button>
          )}
        </div>

        {/* Typography Controls */}
        <div className="flex items-center space-x-1.5 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
          <Type className="w-3.5 h-3.5 text-slate-400 ml-1" />
          <button
            onClick={() => setFontSize('sm')}
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${fontSize === 'sm' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            A-
          </button>
          <button
            onClick={() => setFontSize('base')}
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${fontSize === 'base' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            A
          </button>
          <button
            onClick={() => setFontSize('lg')}
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${fontSize === 'lg' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            A+
          </button>
        </div>
      </div>

      {/* Main Single-Column Reader Typography Body */}
      <div 
        className={`reader-mode-content w-full bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 sm:p-10 shadow-2xl text-slate-200 selection:bg-indigo-500/40 selection:text-white ${fontClass}`}
        onMouseUp={handleSelection}
        onTouchEnd={handleSelection}
      >
        {/* Metadata Header */}
        <div className="border-b border-slate-800 pb-6 mb-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {paper.source}
            </span>
            <span className="flex items-center text-xs text-slate-400 gap-1 font-mono">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              {paper.publishedDate || 'Preprint'}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
            {paper.title}
          </h1>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <User className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="font-medium text-slate-300">{paper.authors.join(', ')}</span>
          </div>
        </div>

        {/* Abstract Box */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 mb-8 space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4" /> Abstract
          </h2>
          <p className="text-slate-300 leading-relaxed font-serif text-sm">
            {paper.abstract}
          </p>
        </div>

        {/* Extracted PDF Body Content */}
        {isExtracting ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-3">
            <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
            <p className="text-xs text-slate-400 font-mono">Extracting & formatting clean document text...</p>
          </div>
        ) : extractedPages.length > 0 ? (
          <div className="space-y-8 font-serif">
            {extractedPages.map((pageText, idx) => (
              <div key={idx} className="space-y-4">
                <div className="flex items-center space-x-3 text-slate-500 text-xs font-mono border-b border-slate-800/60 pb-1">
                  <span>Section / Page {idx + 1}</span>
                </div>
                <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {pageText}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 bg-slate-950/40 border border-slate-800 rounded-2xl text-center space-y-3">
            <p className="text-xs text-slate-400">
              {(resolvedPdfUrl || paper.pdfUrl)
                ? 'Original PDF stream parsing incomplete or restricted. You can view the original PDF canvas or open the publisher page.'
                : 'Direct PDF stream link is unavailable for this repository.'}
            </p>
            <div className="flex justify-center gap-3 pt-2">
              {onSwitchToOriginalPdf && (resolvedPdfUrl || paper.pdfUrl) && (
                <button
                  onClick={onSwitchToOriginalPdf}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                >
                  Try Original PDF View
                </button>
              )}
              <a
                href={paper.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-colors"
              >
                <span>Open Publisher Landing Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
