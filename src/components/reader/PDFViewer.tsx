import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getCachedPaperPdf, cachePaperPdf } from '../../lib/db';
import { TextSelectionContext } from '../../types';
import { ChevronLeft, ChevronRight, HardDrive, CheckCircle } from 'lucide-react';

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
        // Stream through local Edge Proxy if not cached
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

        <button
          onClick={handleCacheToggle}
          disabled={isCached || isCaching}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg font-medium transition-colors ${
            isCached 
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
          }`}
        >
          {isCached ? (
            <>
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Cached Offline</span>
            </>
          ) : isCaching ? (
            <span>Caching PDF...</span>
          ) : (
            <>
              <HardDrive className="w-3.5 h-3.5" />
              <span>Save for Offline</span>
            </>
          )}
        </button>
      </div>

      {/* Virtualized PDF Page Viewport */}
      <div 
        className="overflow-y-auto max-h-[75vh] w-full p-2 flex flex-col items-center selection:bg-indigo-500/40 selection:text-white"
        onMouseUp={handleSelection}
        onTouchEnd={handleSelection}
      >
        <Document
          file={pdfSource}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<div className="p-12 text-slate-400 text-sm font-mono animate-pulse">Loading PDF document...</div>}
          error={
            <div className="p-8 text-center text-rose-400 text-sm bg-rose-950/20 border border-rose-800/40 rounded-xl">
              Failed to load PDF in-app. Use the publisher link above to read online.
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
      </div>
    </div>
  );
}
