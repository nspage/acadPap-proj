import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { PaperCard, PaperNote, TextSelectionContext, UnreadableStampPatch, publisherUrl, showsNoInAppText } from '../../types';
import { NoInAppTextMark } from '../common/NoInAppTextMark';
import { SpokenNotice, SPOKEN } from '../common/SpokenNotice';
import { ReaderModeView } from './ReaderModeView';
import { db } from '../../lib/db';
import { persistNoteNow } from '../../lib/persist-note';
import { persistPlaceNow } from '../../lib/reading-place';
import { fetchDictionaryDefinition, fetchContextualExplanation } from '../../services/explainer';
import { X, Sparkles, Book, Check, ExternalLink, Quote, Lightbulb, FileText } from 'lucide-react';

function emptyNote(paperId: string): PaperNote {
  return {
    id: crypto.randomUUID(),
    paperId,
    takeaways: '',
    jargonTerms: [],
    synthesis: '',
    quotes: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

interface ReaderModalProps {
  paper: PaperCard | null;
  apiKey: string;
  onClose: () => void;
  onPaperUpdated?: (paperId: string, patch: UnreadableStampPatch) => void;
  onImpliedSave: (paper: PaperCard) => Promise<void>;
}

export interface ReaderModalHandle {
  persistPlaceNow: () => Promise<boolean>;
}

export const ReaderModal = forwardRef<ReaderModalHandle, ReaderModalProps>(function ReaderModal(
  { paper, apiKey, onClose, onPaperUpdated, onImpliedSave },
  ref,
) {
  const [activeTab, setActiveTab] = useState<'reader' | 'notes'>('reader');

  const [note, setNote] = useState<PaperNote>(() => emptyNote(paper?.id || ''));
  const noteRef = useRef(note);
  noteRef.current = note;
  const persistChain = useRef(Promise.resolve());
  const scrollRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef(paper);
  paperRef.current = paper;

  useImperativeHandle(ref, () => ({
    persistPlaceNow: () => persistPlaceNow(scrollRef.current, paperRef.current?.id ?? null),
  }), []);

  const [selectedContext, setSelectedContext] = useState<TextSelectionContext | null>(null);
  const [definition, setDefinition] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState<boolean>(false);
  const [persistFailed, setPersistFailed] = useState(false);
  const [notePersisted, setNotePersisted] = useState(false);

  useEffect(() => {
    if (!paper) return;
    let active = true;
    setNote(emptyNote(paper.id));
    setPersistFailed(false);
    setNotePersisted(false);
    db.notes.where('paperId').equals(paper.id).first().then((existingNote) => {
      if (!active || !existingNote) return;
      setNote(existingNote);
      setNotePersisted(true);
    });
    return () => { active = false; };
  }, [paper?.id]);

  if (!paper) return null;

  const landingUrl = publisherUrl(paper);

  const handleTextSelected = async (selection: TextSelectionContext) => {
    setSelectedContext(selection);
    setDefinition(null);
    setAiExplanation(null);
  };

  const handleLookupDictionary = async () => {
    if (!selectedContext) return;
    const def = await fetchDictionaryDefinition(selectedContext.text);
    setDefinition(def);
  };

  const handleExplainAI = async () => {
    if (!selectedContext) return;
    setIsExplaining(true);
    const explanation = await fetchContextualExplanation(
      selectedContext.text,
      selectedContext.context,
      apiKey
    );
    setAiExplanation(explanation);
    setIsExplaining(false);
  };

  const persistLatest = (next: PaperNote) => {
    persistChain.current = persistChain.current.then(async () => {
      try {
        if (next.paperId !== paper.id) return;
        const result = await persistNoteNow(next, paper);
        if (noteRef.current.updatedAt !== next.updatedAt) return;
        if (!result.ok) {
          setPersistFailed(true);
          setNotePersisted(false);
          return;
        }
        setPersistFailed(false);
        setNotePersisted(true);
        if (result.impliedSave) await onImpliedSave(paper);
      } catch (err) {
        console.error('Failed to save the note:', err);
        setPersistFailed(true);
        setNotePersisted(false);
      }
    });
  };

  const writeNote = (patch: Partial<PaperNote>) => {
    const next = { ...noteRef.current, ...patch, updatedAt: Date.now() };
    setNote(next);
    persistLatest(next);
  };

  const retryPersist = () => {
    persistLatest({ ...noteRef.current, updatedAt: Date.now() });
  };

  const handleAddJargonTerm = (term: string, explanation: string) => {
    writeNote({
      jargonTerms: [
        ...noteRef.current.jargonTerms,
        { term, explanation, timestamp: Date.now() },
      ],
    });
  };

  const handleAddQuote = (text: string) => {
    writeNote({
      quotes: [...noteRef.current.quotes, { text, createdAt: Date.now() }],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-5xl h-[92vh] bg-slate-900 border border-slate-800 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="pr-4 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white line-clamp-1">{paper.title}</h2>
              {showsNoInAppText(paper) && <NoInAppTextMark />}
            </div>
            <p className="text-xs text-slate-400">{paper.source} • {paper.authors.slice(0, 2).join(', ')}</p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            {landingUrl && (
              <a
                href={landingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700/60 font-medium transition-colors"
                title="Open Publisher Landing Page"
              >
                <span>Publisher Page</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            )}

            {/* View Tabs */}
            <div className="flex p-1 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <button
                onClick={() => setActiveTab('reader')}
                className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                  activeTab === 'reader' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Reader Mode</span>
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                  activeTab === 'notes' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Notes</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 overflow-hidden relative flex">
          <div
            ref={scrollRef}
            className="w-full h-full p-4 sm:p-6 overflow-y-auto flex flex-col items-center"
          >
            <ReaderModeView
              paper={paper}
              onTextSelected={handleTextSelected}
              onPaperUpdated={onPaperUpdated}
            />
          </div>
          {persistFailed && (
            <div className="absolute bottom-4 left-0 right-0 z-30 px-4">
              <SpokenNotice message={SPOKEN.noteFailed} onRetry={retryPersist} />
            </div>
          )}
          {activeTab === 'notes' && (
            <div className="absolute inset-0 z-10 bg-slate-900 p-6 overflow-y-auto space-y-6">
              {/* Takeaways */}
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                <label className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Lightbulb className="w-4 h-4" /> Core Takeaways
                </label>
                <textarea
                  value={note.takeaways}
                  onChange={(e) => writeNote({ takeaways: e.target.value })}
                  placeholder="What are the key takeaways from this paper?"
                  className="w-full h-24 p-3 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              {/* Vocabulary / Jargon */}
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                <label className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Book className="w-4 h-4" /> Vocabulary & Jargon ({note.jargonTerms.length})
                </label>
                {note.jargonTerms.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Select text in the reader to explain & capture jargon terms.</p>
                ) : (
                  <div className="space-y-2">
                    {note.jargonTerms.map((j, idx) => (
                      <div key={idx} className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs">
                        <span className="font-bold text-indigo-300">{j.term}: </span>
                        <span className="text-slate-300">{j.explanation}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quotes */}
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                <label className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Quote className="w-4 h-4" /> Saved Excerpts & Quotes ({note.quotes.length})
                </label>
                {note.quotes.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Highlight excerpts in the reader to save them as quotes.</p>
                ) : (
                  <div className="space-y-2">
                    {note.quotes.map((q, idx) => (
                      <blockquote key={idx} className="p-3 bg-slate-900 rounded-xl border-l-2 border-indigo-500 text-xs text-slate-300 italic">
                        "{q.text}"
                      </blockquote>
                    ))}
                  </div>
                )}
              </div>

              {/* Personal Synthesis */}
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                <label className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <FileText className="w-4 h-4" /> Personal Synthesis
                </label>
                <textarea
                  value={note.synthesis}
                  onChange={(e) => writeNote({ synthesis: e.target.value })}
                  placeholder="Synthesize how this paper connects to your research or work..."
                  className="w-full h-28 p-3 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div className="flex justify-end">
                <div className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-medium text-xs border border-slate-700/60">
                  <Check className="w-4 h-4" />
                  <span>{persistFailed ? 'Not saved' : notePersisted ? 'Saved' : 'Saved as you type'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Text Selection Explainer Popover Toolbar */}
          {selectedContext && (
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-40 w-11/12 max-w-lg p-4 bg-slate-900/95 border border-indigo-500/30 rounded-2xl shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-indigo-300 truncate max-w-[280px]">
                  "{selectedContext.text}"
                </span>
                <button
                  onClick={() => setSelectedContext(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center space-x-2 mb-3">
                <button
                  onClick={handleLookupDictionary}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium"
                >
                  <Book className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Dictionary</span>
                </button>
                <button
                  onClick={handleExplainAI}
                  disabled={isExplaining}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-medium shadow-sm shadow-indigo-500/20"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isExplaining ? 'AI Thinking...' : 'AI Context Explanation'}</span>
                </button>
                <button
                  onClick={() => {
                    handleAddQuote(selectedContext.text);
                    setSelectedContext(null);
                  }}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium"
                >
                  <Quote className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Save Quote</span>
                </button>
              </div>

              {definition && (
                <div className="p-2.5 bg-slate-950/80 rounded-xl text-xs text-slate-300 border border-slate-800 mb-2">
                  <span className="font-semibold text-indigo-400">Dictionary: </span>
                  {definition}
                </div>
              )}

              {aiExplanation && (
                <div className="p-2.5 bg-slate-950/80 rounded-xl text-xs text-slate-300 border border-indigo-500/30 mb-2">
                  <span className="font-semibold text-indigo-400">AI Context Explainer: </span>
                  {aiExplanation}
                  <button
                    onClick={() => handleAddJargonTerm(selectedContext.text, aiExplanation)}
                    className="mt-2 block text-[11px] text-indigo-400 hover:underline font-medium"
                  >
                    + Save to Vocabulary
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
