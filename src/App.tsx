import { useState, useEffect, useRef } from 'react';
import { Aim, PaperCard, PileStatus, Pool, UnreadableStampPatch, isFeedError } from './types';
import { db, initializeDatabase, DEFAULT_SOURCES } from './lib/db';
import { fetchPapersForAim } from './services/adapters';
import { pushStateToGist, pullStateFromGist } from './services/gist-sync';
import {
  derivePileStatus,
  dropFromLeftover,
  ensureGlobalRecent,
  ensureTopicAim,
  evictJournaledFromLeftovers,
  getActiveAimId,
  getAim,
  markFetchFailed,
  parkAim,
  prependRefresh,
  replaceLeftover,
  replaceStackForPoolFlip,
  restoreAim,
  setActiveAimId,
  shouldFirstFetch,
} from './services/aim-store';
import { Header } from './components/common/Header';
import { SwipeDeck } from './components/deck/SwipeDeck';
import { JournalView } from './components/journal/JournalView';
import { ReaderModal } from './components/reader/ReaderModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { RabbitHoleExplorer } from './components/deck/RabbitHoleExplorer';
import { AimSteer } from './components/deck/AimSteer';
import { useLiveQuery } from 'dexie-react-hooks';
import { Loader2 } from 'lucide-react';

type PileAction = 'replace' | 'refresh' | 'flip';

export function App() {
  const isHydrating = useRef(false);
  const syncTimeout = useRef<NodeJS.Timeout | null>(null);
  const pileGen = useRef(0);
  const lastPileAction = useRef<PileAction>('replace');
  const pendingFlipPool = useRef<Pool | null>(null);

  const [activeTab, setActiveTab] = useState<'discover' | 'journal'>('discover');
  const [papers, setPapers] = useState<PaperCard[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [pileStatus, setPileStatus] = useState<PileStatus>('ready');
  const [activeAimId, setActiveAimIdState] = useState<string>(() => getActiveAimId());
  const [selectedReaderPaper, setSelectedReaderPaper] = useState<PaperCard | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const papersRef = useRef<PaperCard[]>([]);
  papersRef.current = papers;

  const savedPapers = useLiveQuery(() => db.savedPapers.toArray(), []) || [];
  const notes = useLiveQuery(() => db.notes.toArray(), []) || [];
  const dbSources = useLiveQuery(() => db.sources.toArray(), []) || [];
  const aims = useLiveQuery(() => db.aims.toArray(), []) || [];

  const sources = dbSources.length > 0 ? dbSources : DEFAULT_SOURCES;
  const activeAim = aims.find((aim) => aim.id === activeAimId);
  const activePool: Pool = activeAim?.pool ?? 'recent';

  const beginPileWork = () => {
    pileGen.current += 1;
    return pileGen.current;
  };

  const isStale = (gen: number) => gen !== pileGen.current;

  const switchActiveAim = (id: string) => {
    setActiveAimId(id);
    setActiveAimIdState(id);
  };

  const parkCurrentLeftover = async () => {
    const aimId = getActiveAimId();
    const leftover = papersRef.current;
    await parkAim(aimId, leftover.map((paper) => paper.id), leftover);
  };

  const showAimLeftover = (cards: PaperCard[], lastFetchOk: boolean, live?: 'failed' | 'quota') => {
    setPapers(cards);
    papersRef.current = cards;
    setPileStatus(derivePileStatus(cards.length, lastFetchOk, live));
  };

  const filterJournaled = async (cards: PaperCard[]): Promise<PaperCard[]> => {
    const savedIds = new Set((await db.savedPapers.toArray()).map((paper) => paper.id));
    const discardedIds = new Set((await db.discardedIds.toArray()).map((row) => row.id));
    return cards.filter((paper) => !savedIds.has(paper.id) && !discardedIds.has(paper.id));
  };

  const resolveAim = async (aimId: string): Promise<Aim> => {
    const existing = await getAim(aimId);
    if (existing) return existing;
    const seeded = await ensureGlobalRecent();
    switchActiveAim(seeded.id);
    return seeded;
  };

  const failPile = async (aimId: string, err: unknown, leftover: PaperCard[]) => {
    await markFetchFailed(aimId);
    const live = isFeedError(err) && err.kind === 'quota' ? 'quota' : 'failed';
    showAimLeftover(leftover, false, live);
  };

  const replaceActiveStack = async (gen = beginPileWork()) => {
    lastPileAction.current = 'replace';
    const aimId = getActiveAimId();
    setIsLoading(true);
    try {
      const aim = await resolveAim(aimId);
      const fetched = await fetchPapersForAim(aim);
      if (isStale(gen)) return;
      const fresh = await filterJournaled(fetched);
      const next = await replaceLeftover(aim.id, fresh, true);
      if (isStale(gen)) return;
      showAimLeftover(next.leftoverCards, true);
    } catch (err) {
      if (isStale(gen)) return;
      const parked = await getAim(aimId);
      await failPile(aimId, err, parked?.leftoverCards ?? []);
    } finally {
      if (!isStale(gen)) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  const refreshAim = async (gen = beginPileWork()) => {
    lastPileAction.current = 'refresh';
    const aimId = getActiveAimId();
    setIsRefreshing(true);
    try {
      const aim = await resolveAim(aimId);
      const fetched = await fetchPapersForAim(aim);
      if (isStale(gen)) return;
      const fresh = await filterJournaled(fetched);
      const next = await prependRefresh(aim.id, fresh);
      if (isStale(gen)) return;
      showAimLeftover(next.leftoverCards, true);
    } catch (err) {
      if (isStale(gen)) return;
      await failPile(aimId, err, papersRef.current);
    } finally {
      if (!isStale(gen)) {
        setIsRefreshing(false);
        setIsLoading(false);
      }
    }
  };

  const flipPool = async (pool: Pool, gen = beginPileWork()) => {
    lastPileAction.current = 'flip';
    pendingFlipPool.current = pool;
    const aimId = getActiveAimId();
    const current = await resolveAim(aimId);
    if (current.pool === pool) {
      pendingFlipPool.current = null;
      return;
    }
    setIsLoading(true);
    try {
      const fetched = await fetchPapersForAim({ ...current, pool });
      if (isStale(gen)) return;
      const fresh = await filterJournaled(fetched);
      const next = await replaceStackForPoolFlip(current.id, pool, fresh);
      if (isStale(gen)) return;
      pendingFlipPool.current = null;
      showAimLeftover(next.leftoverCards, true);
    } catch (err) {
      if (isStale(gen)) return;
      pendingFlipPool.current = pool;
      await failPile(aimId, err, papersRef.current);
    } finally {
      if (!isStale(gen)) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  const restoreActiveAim = async (gen = beginPileWork()) => {
    await evictJournaledFromLeftovers();
    const aimId = getActiveAimId();
    let aim = await restoreAim(aimId);
    if (!aim) {
      aim = await ensureGlobalRecent();
      switchActiveAim(aim.id);
    } else {
      setActiveAimIdState(aim.id);
    }
    if (isStale(gen)) return;
    if (shouldFirstFetch(aim)) {
      await replaceActiveStack(gen);
      return;
    }
    showAimLeftover(aim.leftoverCards, aim.lastFetchOk);
    setIsLoading(false);
    setIsRefreshing(false);
  };

  const handleSelectAim = async (aimId: string) => {
    const gen = beginPileWork();
    await parkCurrentLeftover();
    switchActiveAim(aimId);
    await evictJournaledFromLeftovers();
    const aim = await restoreAim(aimId);
    if (isStale(gen)) return;
    if (!aim || shouldFirstFetch(aim)) {
      setIsLoading(true);
      await replaceActiveStack(gen);
      return;
    }
    showAimLeftover(aim.leftoverCards, aim.lastFetchOk);
    setIsLoading(false);
    setIsRefreshing(false);
  };

  const handleSelectRabbitHole = async (topicId: string, topicName: string) => {
    setIsExplorerOpen(false);
    const gen = beginPileWork();
    await parkCurrentLeftover();
    const aim = await ensureTopicAim(topicId, topicName);
    switchActiveAim(aim.id);
    await evictJournaledFromLeftovers();
    const restored = await restoreAim(aim.id);
    if (isStale(gen)) return;
    if (!restored || shouldFirstFetch(restored)) {
      setIsLoading(true);
      await replaceActiveStack(gen);
      return;
    }
    showAimLeftover(restored.leftoverCards, restored.lastFetchOk);
    setIsLoading(false);
    setIsRefreshing(false);
  };

  const handleRetryPile = () => {
    if (lastPileAction.current === 'refresh') {
      void refreshAim();
      return;
    }
    if (lastPileAction.current === 'flip') {
      const pool = pendingFlipPool.current ?? (activePool === 'recent' ? 'cited' : 'recent');
      void flipPool(pool);
      return;
    }
    void replaceActiveStack();
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

  useEffect(() => {
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
      const leftover = aim?.leftoverCards ?? papersRef.current.filter((card) => card.id !== paper.id);
      showAimLeftover(leftover, aim?.lastFetchOk ?? true);
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
      const leftover = aim?.leftoverCards ?? papersRef.current.filter((card) => card.id !== paper.id);
      showAimLeftover(leftover, aim?.lastFetchOk ?? true);
      return true;
    } catch (err) {
      console.error('Failed to discard paper:', err);
      return false;
    }
  };

  const handlePaperUpdated = (paperId: string, patch: UnreadableStampPatch) => {
    const apply = (card: PaperCard): PaperCard => {
      const next = { ...card, ...patch };
      if (patch.unreadableStampedAt == null) delete next.unreadableStampedAt;
      return next;
    };
    setPapers((prev) => {
      const next = prev.map((card) => (card.id === paperId ? apply(card) : card));
      papersRef.current = next;
      return next;
    });
    setSelectedReaderPaper((prev) => (prev && prev.id === paperId ? apply(prev) : prev));
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
      switchActiveAim(aim.id);
      setIsLoading(true);
      await replaceActiveStack();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshFeed={() => {
          void refreshAim();
        }}
        isRefreshing={isRefreshing}
        savedCount={savedPapers.length}
      />

      <main className="flex-1 flex flex-col items-center justify-start p-4 w-full">
        {activeTab === 'discover' ? (
          <div className="w-full flex flex-col items-center h-full max-w-3xl mx-auto">
            <AimSteer
              aims={aims}
              activeAimId={activeAimId}
              pool={activePool}
              onSelectAim={(id) => { void handleSelectAim(id); }}
              onFlipPool={(pool) => { void flipPool(pool); }}
              onDive={() => setIsExplorerOpen(true)}
            />

            {isLoading ? (
              <div className="flex flex-col items-center justify-center space-y-3 p-12 mt-12">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-xs text-slate-400 font-mono">Loading the pile...</p>
              </div>
            ) : (
              <div className="flex-1 w-full flex items-center justify-center">
                <SwipeDeck
                  papers={papers}
                  pileStatus={pileStatus}
                  onSave={handleSavePaper}
                  onDiscard={handleDiscardPaper}
                  onOpen={(paper) => setSelectedReaderPaper(paper)}
                  onRefresh={() => { void refreshAim(); }}
                  onRetryPile={handleRetryPile}
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

      {selectedReaderPaper && (
        <ReaderModal
          paper={selectedReaderPaper}
          apiKey={apiKey}
          onClose={() => setSelectedReaderPaper(null)}
          onPaperUpdated={handlePaperUpdated}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          apiKey={apiKey}
          onSaveApiKey={handleSaveApiKey}
          sources={sources}
          onResetDatabase={handleResetDatabase}
          onClose={() => {
            setIsSettingsOpen(false);
            void restoreActiveAim();
          }}
        />
      )}

      {isExplorerOpen && (
        <RabbitHoleExplorer
          onSelectTopic={handleSelectRabbitHole}
          onClose={() => setIsExplorerOpen(false)}
        />
      )}
    </div>
  );
}
