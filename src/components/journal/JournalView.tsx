import { useState } from 'react';
import { PaperCard, PaperNote } from '../../types';
import { exportAllNotesAsMarkdown } from '../../utils/export';
import { BookOpen, Download, Trash2, ExternalLink, Tag, Sparkles, FileText, Quote, Book } from 'lucide-react';
import { db } from '../../lib/db';

interface JournalViewProps {
  savedPapers: PaperCard[];
  notes: PaperNote[];
  onOpenReader: (paper: PaperCard) => void;
  onRemovePaper: (paperId: string) => void;
}

export function JournalView({ savedPapers, notes, onOpenReader, onRemovePaper }: JournalViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const notesMap = new Map(notes.map((n) => [n.paperId, n]));

  const categories = Array.from(
    new Set(savedPapers.map((p) => p.source))
  );

  const filteredPapers = savedPapers.filter(
    (p) => selectedCategory === 'all' || p.source === selectedCategory
  );

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6">
      {/* Journal Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" /> Learning Journal & Library
          </h2>
          <p className="text-xs text-slate-400">
            {savedPapers.length} saved paper{savedPapers.length === 1 ? '' : 's'} • Local-first storage
          </p>
        </div>

        <button
          onClick={exportAllNotesAsMarkdown}
          disabled={savedPapers.length === 0}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 transition-all"
        >
          <Download className="w-4 h-4" />
          <span>Export All Notes (.md)</span>
        </button>
      </div>

      {/* Repository Filter Tabs */}
      {categories.length > 0 && (
        <div className="flex items-center space-x-2 overflow-x-auto pb-4 mb-4 text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All Sources ({savedPapers.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Empty State */}
      {filteredPapers.length === 0 ? (
        <div className="text-center p-12 bg-slate-900/40 rounded-3xl border border-slate-800 max-w-md mx-auto my-8">
          <Sparkles className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white mb-1">Your Journal is Empty</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Swipe right or click "Save & Deep Read" on discovery cards to curate papers into your library.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPapers.map((paper) => {
            const note = notesMap.get(paper.id);
            const quoteCount = note?.quotes?.length || 0;
            const jargonCount = note?.jargonTerms?.length || 0;
            const hasSynthesis = Boolean(note?.synthesis || note?.takeaways);

            return (
              <div
                key={paper.id}
                className="bg-slate-900/90 border border-slate-800/90 hover:border-slate-700/90 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {paper.source}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">{paper.publishedDate}</span>
                  </div>

                  <h3 className="text-base font-bold text-white line-clamp-2 mb-2 leading-snug">
                    {paper.title}
                  </h3>

                  <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">
                    {paper.abstract}
                  </p>

                  {/* Note Highlights Badges */}
                  <div className="flex flex-wrap gap-2 mb-4 text-[11px]">
                    {hasSynthesis && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <FileText className="w-3 h-3" /> Notes Added
                      </span>
                    )}
                    {jargonCount > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        <Book className="w-3 h-3" /> {jargonCount} Jargon Terms
                      </span>
                    )}
                    {quoteCount > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                        <Quote className="w-3 h-3" /> {quoteCount} Quotes
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <button
                    onClick={() => onRemovePaper(paper.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Remove from Journal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {paper.hasContent ? (
                    <button
                      onClick={() => onOpenReader(paper)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-md shadow-indigo-500/20 transition-all"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Open Reader</span>
                    </button>
                  ) : (
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/60 transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Read on Publisher</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
