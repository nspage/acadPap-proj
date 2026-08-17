import { useState } from 'react';
import { PaperCard, publisherUrl, showsNoInAppText } from '../../types';
import { ExternalLink, Heart, User, Calendar, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import { NoInAppTextMark } from '../common/NoInAppTextMark';

interface PaperCardItemProps {
  paper: PaperCard;
  onSave: () => void;
  onDiscard: () => void;
  onOpen: () => void;
  isTopCard?: boolean;
}

export function PaperCardItem({ paper, onSave, isTopCard }: PaperCardItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const landingUrl = publisherUrl(paper);

  return (
    <div className="w-full h-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col justify-between selection:bg-indigo-500/30 overflow-hidden">
      {/* Scrollable Main Content Area */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
        {/* Retraction Warning */}
        {paper.isRetracted && (
          <div className="flex items-center justify-center bg-red-500/20 text-red-400 font-bold text-xs uppercase tracking-widest py-1.5 px-3 rounded-xl border border-red-500/30 mb-2">
            🚨 Retracted Paper
          </div>
        )}

        {/* Source Badge & Date */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="px-3 py-1 rounded-full text-xs font-semibold tracking-wide bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {paper.source}
            </span>
            {showsNoInAppText(paper) && <NoInAppTextMark />}
          </div>
          <span className="flex items-center text-xs text-slate-400 gap-1 font-mono shrink-0">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            {paper.publishedDate || 'Recent'}
          </span>
        </div>

        {/* Paper Title */}
        <h2 className="text-xl font-bold tracking-tight text-white line-clamp-3 leading-snug">
          {paper.title}
        </h2>

        {/* Authors */}
        <div className="flex items-center gap-1.5 text-xs text-slate-300 line-clamp-1">
          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="font-medium text-slate-300">{paper.authors.join(', ')}</span>
        </div>

        {/* High-Signal Contextual Metadata Ribbon */}
        <div className="flex flex-wrap gap-2 pt-1 pb-2">
          {paper.citationCount != null && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              ⭐ {paper.citationCount} Citations
            </span>
          )}
          {paper.primaryInstitution && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700/60 max-w-[200px] truncate">
              🏛️ <span className="truncate">{paper.primaryInstitution}</span>
              {paper.primaryInstitutionCountry && <span className="text-slate-500">, {paper.primaryInstitutionCountry}</span>}
            </span>
          )}
          {paper.documentType && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              🔓 {paper.oaStatus ? `${paper.oaStatus.charAt(0).toUpperCase() + paper.oaStatus.slice(1)} OA` : 'OA'} • {paper.documentType}
            </span>
          )}
        </div>

        {/* Abstract Box */}
        <div className="relative group">
          <div
            className={`text-sm text-slate-300 leading-relaxed bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80 transition-all ${
              isExpanded ? 'max-h-56 overflow-y-auto' : 'line-clamp-4'
            }`}
          >
            {paper.abstract}
          </div>
          {paper.abstract.length > 180 && (
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
          <div className="flex flex-wrap gap-1.5 pt-1">
            {paper.tags.slice(0, 4).map((tag, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700/60"
              >
                <Tag className="w-2.5 h-2.5 text-slate-400" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Pinned Footer Controls & Direct Publisher Link */}
      <div className="shrink-0 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3 mt-3">
        {landingUrl ? (
          <a
            href={landingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            <span>Landing Page</span>
          </a>
        ) : (
          <span />
        )}

        {isTopCard && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/25 transition-all"
          >
            <Heart className="w-4 h-4" />
            <span>Save</span>
          </button>
        )}
      </div>
    </div>
  );
}
