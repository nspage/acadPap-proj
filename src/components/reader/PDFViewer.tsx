import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getCachedPaperPdf, db } from '../../lib/db';
import { TextSelectionContext } from '../../types';
import { ChevronLeft, ChevronRight, HardDrive, CheckCircle, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';

import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';

// Local Vite asset import guarantees 100% offline PWA operation
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PDFViewerProps {
  paperId: string;
  url: string;
  onTextSelected: (selection: TextSelectionContext) => void;
}

export function PDFViewer({ paperId, url, onTextSelected }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfSource, setPdfSource] = useState<Blob | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState<boolean>(false);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);

  useEffect(() => {
    let active = true;
    setIsLoadingPdf(true);
    setPdfError(null);

    async function loadPdfBinary() {
      try {
        // 1. Check Dexie IndexedDB cache first
        const cachedBlob = await getCachedPaperPdf(paperId);
        if (!active) return;
        
        if (cachedBlob) {
          setPdfSource(cachedBlob);
          setIsCached(true);
          setIsLoadingPdf(false);
          return;
        }

        // 2. Fetch binary via Edge Proxy
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const blob = await res.blob();
        if (!active) return;

        setPdfSource(blob);
        setIsLoadingPdf(false);

        // 3. Automatically cache Blob in Dexie IndexedDB for instant offline reading
        await db.pdfCache.put({
          paperId,
          blob,
          cachedAt: Date.now(),
          sizeBytes: blob.size
        });
        setIsCached(true);
      } catch (err: any) {
        if (!active) return;
        console.error('Failed to load PDF binary:', err);
        setPdfError(err.message || 'Failed to fetch PDF binary');
        setIsLoadingPdf(false);
      }
    }

    loadPdfBinary();
    return () => { active = false; };
  }, [paperId, url, retryTrigger]);

  const handleRetry = () => {
    setRetryTrigger((t) => t + 1);
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
      {/* Reader Control Bar: Pagination & Local Storage Caching */}
      <div className="sticky top-0 z-20 flex items-center justify-between w-full px-4 py-2 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-800 text-xs text-slate-200 mb-3 shadow-lg">
        <div className="flex items-center space-x-2">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-slate-200" />
          </button>
          <span className="font-mono text-slate-300">
            Page {currentPage} of {numPages}
          </span>
          <button
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-200" />
          </button>
        </div>

        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          <CheckCircle className="w-3.5 h-3.5" />
          <span>{isCached ? 'Cached Offline in Dexie' : 'Binary Stream Loaded'}</span>
        </div>
      </div>

      {/* PDF Stream Viewport */}
      <div 
        className="overflow-y-auto max-h-[75vh] w-full p-2 flex flex-col items-center selection:bg-indigo-500/40 selection:text-white"
        onMouseUp={handleSelection}
        onTouchEnd={handleSelection}
      >
        {isLoadingPdf ? (
          <div className="flex flex-col items-center justify-center p-16 space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-xs text-slate-400 font-mono">Fetching raw PDF binary stream...</p>
          </div>
        ) : pdfError || !pdfSource ? (
          <div className="p-8 text-center max-w-md bg-rose-950/20 border border-rose-800/40 rounded-2xl space-y-4 my-8">
            <div className="text-rose-400 text-sm font-semibold">
              Unable to load PDF stream directly in-app.
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {pdfError || 'The target repository may block embedded stream piping.'}
            </p>
            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                onClick={handleRetry}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Stream</span>
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-500/20 transition-colors"
              >
                <span>Open Publisher Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ) : (
          <Document
            file={pdfSource}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            loading={<div className="p-12 text-slate-400 text-sm font-mono animate-pulse">Parsing PDF document pages...</div>}
            error={
              <div className="p-8 text-center max-w-md bg-rose-950/20 border border-rose-800/40 rounded-2xl space-y-4 my-8">
                <div className="text-rose-400 text-sm font-semibold">
                  Failed to parse PDF binary document.
                </div>
                <div className="flex items-center justify-center space-x-3 pt-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                  >
                    <span>Open Publisher Page</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
              width={Math.min(window.innerWidth - 48, 750)}
              className="shadow-2xl rounded-lg overflow-hidden"
              renderAnnotationLayer={false}
              renderTextLayer={true}
            />
          </Document>
        )}
      </div>
    </div>
  );
}
