import { useState } from 'react';
import { PaperCard } from '../../types';
import { ExternalLink, BookOpen, User, Calendar, Tag, ChevronDown, ChevronUp } from 'lucide-react';

interface PaperCardItemProps {
  paper: PaperCard;
  onSaveAndRead: () => void;
  onDiscard: () => void;
  isTopCard?: boolean;
}

export function PaperCardItem({ paper, onSaveAndRead, isTopCard }: PaperCardItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="w-full h-full bg-slate-900/95 border border-slate-800/90 rounded-3xl p-6 shadow-2xl flex flex-col justify-between backdrop-blur-xl selection:bg-indigo-500/30 overflow-hidden">
      {/* Top Header: Source Badge & Date */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="px-3 py-1 rounded-full text-xs font-semibold tracking-wide bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            {paper.source}
          </span>
          <span className="flex items-center text-xs text-slate-400 gap-1 font-mono">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            {paper.publishedDate || 'Recent'}
          </span>
        </div>

        {/* Paper Title */}
        <h2 className="text-xl font-bold tracking-tight text-white line-clamp-3 leading-snug mb-3">
          {paper.title}
        </h2>

        {/* Authors */}
        <div className="flex items-center gap-1.5 text-xs text-slate-300 mb-4 line-clamp-1">
          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="font-medium text-slate-300">{paper.authors.join(', ')}</span>
        </div>

        {/* Abstract Box */}
        <div className="relative group">
          <div
            className={`text-sm text-slate-300 leading-relaxed bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 transition-all ${
              isExpanded ? 'max-h-64 overflow-y-auto' : 'line-clamp-4'
            }`}
          >
            {paper.abstract}
          </div>
          {paper.abstract.length > 200 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
            >
              {isExpanded ? (
                <>Collapse Abstract <ChevronUp className="w-3 h-3" /></>
              ) : (
                <>Expand Abstract <ChevronDown className="w-3 h-3" /></>
              )}
            </button>
          )}
        </div>

        {/* Tags */}
        {paper.tags && paper.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {paper.tags.slice(0, 4).map((tag, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-800/80 text-slate-300 border border-slate-700/50"
              >
                <Tag className="w-2.5 h-2.5 text-slate-400" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer Controls & Direct Publisher Link */}
      <div className="pt-4 border-t border-slate-800/60 flex items-center justify-between gap-3 mt-4">
        <a
          href={paper.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          <span>Landing Page</span>
        </a>

        {isTopCard && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSaveAndRead();
            }}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/25 transition-all"
          >
            <BookOpen className="w-4 h-4" />
            <span>Save & Deep Read</span>
          </button>
        )}
      </div>
    </div>
  );
}
