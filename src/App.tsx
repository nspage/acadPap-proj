import { useState, useEffect, useRef } from 'react';
import { PaperCard } from './types';
import { db, initializeDatabase, DEFAULT_SOURCES } from './lib/db';
import { fetchAllEnabledPapers } from './services/adapters';
import { pushStateToGist, pullStateFromGist } from './services/gist-sync';
import {
  aimIdFromSourceId,
  dropFromLeftover,
  ensureGlobalRecent,
  ensureTopicAim,
  evictJournaledFromLeftovers,
  getActiveAimId,
  getAim,
  markFetchFailed,
  parkAim,
  replaceLeftover,
  restoreAim,
  setActiveAimId,
  shouldFirstFetch,
  sourceIdFromAimId,
} from './services/aim-store';
import { Header } from './components/common/Header';
import { SwipeDeck } from './components/deck/SwipeDeck';
import { JournalView } from './components/journal/JournalView';
import { ReaderModal } from './components/reader/ReaderModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { RabbitHoleExplorer } from './components/deck/RabbitHoleExplorer';
import { useLiveQuery } from 'dexie-react-hooks';
import { Loader2, Compass, TrendingUp, Clock } from 'lucide-react';

export function App() {
  const isHydrating = useRef(false);
  const syncTimeout = useRef<NodeJS.Timeout | null>(null);
  const [activeTab, setActiveTab] = useState<'discover' | 'journal'>('discover');
  const [papers, setPapers] = useState<PaperCard[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [selectedReaderPaper, setSelectedReaderPaper] = useState<PaperCard | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [sortImpact, setSortImpact] = useState<boolean>(() => localStorage.getItem('sort_impact') === 'true');
  const papersRef = useRef<PaperCard[]>([]);
  papersRef.current = papers;

  const toggleSortImpact = () => {
    const next = !sortImpact;
    setSortImpact(next);
    localStorage.setItem('sort_impact', next.toString());
    void replaceActiveStack();
  };

  // Dexie live reactive queries
  const savedPapers = useLiveQuery(() => db.savedPapers.toArray(), []) || [];
  const notes = useLiveQuery(() => db.notes.toArray(), []) || [];
  const dbSources = useLiveQuery(() => db.sources.toArray(), []) || [];

  const sources = dbSources.length > 0 ? dbSources : DEFAULT_SOURCES;

  const parkCurrentLeftover = async () => {
    const aimId = getActiveAimId();
    const leftover = papersRef.current;
    await parkAim(aimId, leftover.map((paper) => paper.id), leftover);
  };

  const showAimLeftover = (cards: PaperCard[]) => {
    setPapers(cards);
    papersRef.current = cards;
  };

  const replaceActiveStack = async () => {
    const aimId = getActiveAimId();
    setIsLoading(true);
    try {
      const currentSources = await db.sources.toArray();
      const activeSources = (currentSources.length > 0 ? currentSources : DEFAULT_SOURCES).filter((s) => s.enabled);
      const fetched = await fetchAllEnabledPapers(activeSources);
      const savedIds = new Set((await db.savedPapers.toArray()).map((p) => p.id));
      const discardedIds = new Set((await db.discardedIds.toArray()).map((d) => d.id));
      const freshPapers = fetched.filter((p) => !savedIds.has(p.id) && !discardedIds.has(p.id));
      const aim = await replaceLeftover(aimId, freshPapers, true);
      showAimLeftover(aim.leftoverCards);
    } catch (err) {
      console.error('Failed to load feed:', err);
      await markFetchFailed(aimId);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const restoreActiveAim = async () => {
    await evictJournaledFromLeftovers();
    const aimId = getActiveAimId();
    let aim = await restoreAim(aimId);
    if (!aim) {
      aim = await ensureGlobalRecent();
      setActiveAimId(aim.id);
    }
    if (shouldFirstFetch(aim)) {
      await replaceActiveStack();
      return;
    }
    showAimLeftover(aim.leftoverCards);
    setIsLoading(false);
    setIsRefreshing(false);
  };

  useEffect(() => {
    let active = true;
    initializeDatabase().then(async () => {
      if (!active) return;
      const pat = localStorage.getItem('github_pat');
      const gistId = localStorage.getItem('gist_id');

      if (pat && gistId) {
        isHydrating.current = true;
        await pullStateFromGist(pat, gistId);
        isHydrating.current = false;
      }

      if (active) await restoreActiveAim();
    });
    return () => { active = false; };
  }, []);

  // Reactive Debounced Auto-Push
  useEffect(() => {
    // Skip if we haven't loaded, or if we are actively pulling from the cloud
    if (isLoading || isHydrating.current) return;
    
    const pat = localStorage.getItem('github_pat');
    const gistId = localStorage.getItem('gist_id');
    if (!pat || !gistId) return;

    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    
    syncTimeout.current = setTimeout(() => {
      pushStateToGist(pat, gistId);
    }, 3000);

    return () => {
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
    };
  }, [savedPapers, notes, dbSources]);

  const handleSavePaper = async (paper: PaperCard): Promise<boolean> => {
    try {
      await db.savedPapers.put({ ...paper, updatedAt: Date.now() });
      const aimId = getActiveAimId();
      await dropFromLeftover(aimId, paper.id);
      const aim = await getAim(aimId);
      showAimLeftover(aim?.leftoverCards ?? papersRef.current.filter((card) => card.id !== paper.id));
      if (paper.hasContent) {
        setSelectedReaderPaper(paper);
      } else {
        window.open(paper.url, '_blank', 'noopener,noreferrer');
      }
      return true;
    } catch (err) {
      console.error('Failed to save paper:', err);
      return false;
    }
  };

  const handleDiscardPaper = async (paper: PaperCard): Promise<boolean> => {
    try {
      await db.discardedIds.put({ id: paper.id, discardedAt: Date.now() });
      const aimId = getActiveAimId();
      await dropFromLeftover(aimId, paper.id);
      const aim = await getAim(aimId);
      showAimLeftover(aim?.leftoverCards ?? papersRef.current.filter((card) => card.id !== paper.id));
      return true;
    } catch (err) {
      console.error('Failed to discard paper:', err);
      return false;
    }
  };

  const handleRemoveSavedPaper = async (paperId: string) => {
    try {
      await db.savedPapers.delete(paperId);
      await db.notes.where('paperId').equals(paperId).delete();
      await db.pdfCache.delete(paperId);
      await db.contentCache.delete(paperId);
      await db.readingPlaces.delete(paperId);
    } catch (err) {
      console.error('Failed to remove paper:', err);
    }
  };

  const handleToggleSource = async (sourceId: string) => {
    const target = sources.find((s) => s.id === sourceId);
    if (target) {
      await db.sources.update(sourceId, { enabled: !target.enabled });
    }
  };

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
  };

  const handleResetDatabase = async () => {
    if (confirm('Are you sure you want to clear all saved papers and cached data?')) {
      await db.savedPapers.clear();
      await db.notes.clear();
      await db.discardedIds.clear();
      await db.pdfCache.clear();
      await db.contentCache.clear();
      await db.aims.clear();
      await db.readingPlaces.clear();
      await db.journalTombstones.clear();
      await db.sources.clear();
      await db.sources.bulkAdd(DEFAULT_SOURCES);
      localStorage.removeItem('active_aim_id');
      const aim = await ensureGlobalRecent();
      setActiveAimId(aim.id);
      setIsLoading(true);
      await replaceActiveStack();
    }
  };

  const handleSelectChannel = async (sourceId: string) => {
    await parkCurrentLeftover();
    const aimId = aimIdFromSourceId(sourceId);
    setActiveAimId(aimId);
    await db.transaction('rw', db.sources, async () => {
      const all = await db.sources.toArray();
      for (const s of all) {
        await db.sources.update(s.id, { enabled: s.id === sourceId });
      }
    });
    const aim = await restoreAim(aimId);
    if (!aim || shouldFirstFetch(aim)) {
      setIsLoading(true);
      await replaceActiveStack();
      return;
    }
    showAimLeftover(aim.leftoverCards);
  };

  const [isExplorerOpen, setIsExplorerOpen] = useState(false);

  const handleSelectRabbitHole = async (topicId: string, topicName: string) => {
    setIsExplorerOpen(false);
    await parkCurrentLeftover();

    const aim = await ensureTopicAim(topicId, topicName);
    setActiveAimId(aim.id);

    const sourceId = sourceIdFromAimId(aim.id);
    await db.transaction('rw', db.sources, async () => {
      const all = await db.sources.toArray();
      for (const s of all) {
        await db.sources.update(s.id, { enabled: false });
      }

      const exists = await db.sources.get(sourceId);
      if (exists) {
        await db.sources.update(sourceId, { enabled: true, name: topicName });
      } else {
        await db.sources.put({
          id: sourceId,
          type: 'openalex',
          name: topicName,
          category: topicName,
          enabled: true,
          params: { openAlexFilter: `topics.id:${topicId}` }
        });
      }
    });

    const restored = await restoreAim(aim.id);
    if (!restored || shouldFirstFetch(restored)) {
      setIsLoading(true);
      await replaceActiveStack();
      return;
    }
    showAimLeftover(restored.leftoverCards);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Header Bar */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshFeed={() => {
          setIsRefreshing(true);
          void replaceActiveStack();
        }}
        isRefreshing={isRefreshing}
        savedCount={savedPapers.length}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col items-center justify-start p-4 w-full">
        {activeTab === 'discover' ? (
          <div className="w-full flex flex-col items-center h-full max-w-3xl mx-auto">
            {/* Explorer & Saved Topics Ribbon */}
            <div className="w-full flex flex-col space-y-3 pb-2 mb-4 px-2 border-b border-slate-800/60">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Saved Explorations</span>
                <button
                  onClick={() => setIsExplorerOpen(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-lg transition-all"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Dive New Rabbit Hole</span>
                </button>
              </div>
              
              <div className="flex items-center space-x-2 overflow-x-auto pb-3 custom-scrollbar w-full snap-x">
                {sources.map(source => (
                  <button
                    key={source.id}
                    onClick={() => handleSelectChannel(source.id)}
                    className={`shrink-0 snap-start px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      source.enabled 
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20' 
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {source.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort Toggle */}
            <div className="w-full flex items-center justify-between px-3 pb-2 mb-2">
              <span className="text-[11px] text-slate-500 font-medium">Feed Ordering</span>
              <button
                onClick={toggleSortImpact}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
              >
                {sortImpact ? (
                  <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span className={sortImpact ? "text-amber-400" : "text-emerald-400"}>
                  {sortImpact ? 'Top Impact' : 'Most Recent'}
                </span>
              </button>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center space-y-3 p-12 mt-12">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-xs text-slate-400 font-mono">Aggregation & Serendipity Shuffling...</p>
              </div>
            ) : (
              <div className="flex-1 w-full flex items-center justify-center">
                <SwipeDeck
                  papers={papers}
                  onSave={handleSavePaper}
                  onDiscard={handleDiscardPaper}
                  onRefresh={() => {
                    setIsRefreshing(true);
                    void replaceActiveStack();
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <JournalView
            savedPapers={savedPapers}
            notes={notes}
            onOpenReader={(paper) => setSelectedReaderPaper(paper)}
            onRemovePaper={handleRemoveSavedPaper}
          />
        )}
      </main>

      {/* Deep Reader Modal */}
      {selectedReaderPaper && (
        <ReaderModal
          paper={selectedReaderPaper}
          apiKey={apiKey}
          onClose={() => setSelectedReaderPaper(null)}
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          apiKey={apiKey}
          onSaveApiKey={handleSaveApiKey}
          sources={sources}
          onToggleSource={handleToggleSource}
          onResetDatabase={handleResetDatabase}
          onClose={() => {
            setIsSettingsOpen(false);
            void restoreActiveAim();
          }}
        />
      )}

      {/* Rabbit Hole Explorer */}
      {isExplorerOpen && (
        <RabbitHoleExplorer
          onSelectTopic={handleSelectRabbitHole}
          onClose={() => setIsExplorerOpen(false)}
        />
      )}
    </div>
  );
}
