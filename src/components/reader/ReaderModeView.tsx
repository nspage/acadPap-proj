import { useState, useEffect } from 'react';
import { PaperCard, TextSelectionContext } from '../../types';
import { fetchStructuredContent, ContentResult } from '../../services/openalex-content';
import { Type, Sparkles, BookOpen, Loader2, Calendar, User, ExternalLink, AlertCircle, TrendingUp, Globe, Landmark, Link, AlertTriangle } from 'lucide-react';

interface ReaderModeViewProps {
  paper: PaperCard;
  onTextSelected: (selection: TextSelectionContext) => void;
}

export function ReaderModeView({ paper, onTextSelected }: ReaderModeViewProps) {
  const [content, setContent] = useState<ContentResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(false);

    fetchStructuredContent(paper.id)
      .then(result => {
        if (!active) return;
        if (result && result.sections.length > 0) {
          setContent(result);
        } else {
          setLoadError(true);
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
        setIsLoading(false);
      });

    return () => { active = false; };
  }, [paper.id]);

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
        <div className="border-b border-slate-800 pb-8 mb-8 space-y-5">
          {paper.isRetracted && (
            <div className="flex items-center gap-2 bg-red-500/20 text-red-400 font-bold text-xs uppercase tracking-widest py-2 px-4 rounded-xl border border-red-500/30">
              <AlertTriangle className="w-4 h-4" />
              This paper has been retracted
            </div>
          )}

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

          {/* Full Authorships */}
          <div className="space-y-2">
            {paper.fullAuthorships && paper.fullAuthorships.length > 0 ? (
              paper.fullAuthorships.map((auth, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-slate-400">
                  <User className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium text-slate-200">{auth.name}</span>
                    {auth.institution && (
                      <span className="text-slate-500"> • {auth.institution} {auth.countryCode && `(${auth.countryCode})`}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <User className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="font-medium text-slate-300">{paper.authors.join(', ')}</span>
              </div>
            )}
          </div>

          {/* Deep Impact & Context */}
          <div className="flex flex-wrap gap-2 pt-2">
            {(paper.citationCount != null || paper.fwci != null) && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-950/60 border border-slate-800 text-slate-300">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                {paper.citationCount ?? 0} Citations
                {paper.fwci != null && <span className="text-slate-500 border-l border-slate-700 ml-1.5 pl-1.5">FWCI: {paper.fwci.toFixed(2)}</span>}
              </span>
            )}

            {paper.referencedWorksCount != null && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-950/60 border border-slate-800 text-slate-300">
                <Link className="w-3.5 h-3.5 text-slate-400" />
                {paper.referencedWorksCount} References
              </span>
            )}

            {paper.funders && paper.funders.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-950/60 border border-slate-800 text-slate-300">
                <Landmark className="w-3.5 h-3.5 text-emerald-400" />
                <span className="truncate max-w-[200px]">Funded by {paper.funders[0]}</span>
              </span>
            )}

            {paper.sdgs && paper.sdgs.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-950/60 border border-slate-800 text-slate-300">
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span className="truncate max-w-[200px]">{paper.sdgs[0]}</span>
              </span>
            )}
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

        {/* Structured Content Body */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-3">
            <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
            <p className="text-xs text-slate-400 font-mono">Fetching structured document content...</p>
          </div>
        ) : loadError || !content ? (
          <div className="p-6 bg-slate-950/40 border border-slate-800 rounded-2xl text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-amber-400 text-sm font-semibold">
              <AlertCircle className="w-4 h-4" />
              <span>Structured content unavailable</span>
            </div>
            <p className="text-xs text-slate-400">
              The full text for this paper could not be retrieved from OpenAlex. You can read it on the publisher's site.
            </p>
            <a
              href={paper.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-colors"
            >
              <span>Open Publisher Page</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <div className="space-y-8 font-serif">
            {content.sections.map((section, idx) => (
              <div key={idx} className="space-y-4">
                {section.heading && (
                  <h2 className="text-lg font-bold text-white tracking-tight border-b border-slate-800/60 pb-2">
                    {section.heading}
                  </h2>
                )}
                {section.paragraphs.map((p, pIdx) => (
                  <p key={pIdx} className="text-slate-200 leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
