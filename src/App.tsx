import { useState, useEffect, useRef } from 'react';
import { Aim, PaperCard, PileStatus, Pool, UnreadableStampPatch, isFeedError } from './types';
import { db, initializeDatabase, DEFAULT_SOURCES } from './lib/db';
import { fetchPapersForAim } from './services/adapters';
import {
  flushJournalPush,
  getJournalCreds,
  journalIsDirty,
  lastJournalPushFailed,
  pullStateFromGist,
  scheduleJournalPush,
} from './services/gist-sync';
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
import { SpokenNotice, SPOKEN } from './components/common/SpokenNotice';
import { SwipeDeck } from './components/deck/SwipeDeck';
import { JournalView } from './components/journal/JournalView';
import { ReaderModal, type ReaderModalHandle } from './components/reader/ReaderModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { RabbitHoleExplorer } from './components/deck/RabbitHoleExplorer';
import { AimSteer } from './components/deck/AimSteer';
import {
  clearSyncFailedOnLeave,
  didSyncFailOnLeave,
} from './lib/reading-place';
import { useLiveQuery } from 'dexie-react-hooks';
import { Loader2 } from 'lucide-react';

type PileAction = 'replace' | 'refresh' | 'flip';

export function App() {
  const pileGen = useRef(0);
  const lastPileAction = useRef<PileAction>('replace');
  const pendingFlipPool = useRef<Pool | null>(null);
  const readerRef = useRef<ReaderModalHandle>(null);

  const [activeTab, setActiveTab] = useState<'discover' | 'journal'>('discover');
  const [papers, setPapers] = useState<PaperCard[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [pileStatus, setPileStatus] = useState<PileStatus>('ready');
  const [activeAimId, setActiveAimIdState] = useState<string>(() => getActiveAimId());
  const [selectedReaderPaper, setSelectedReaderPaper] = useState<PaperCard | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [leaveSyncFailed, setLeaveSyncFailed] = useState(() => didSyncFailOnLeave());
  const [journalPullFailed, setJournalPullFailed] = useState(false);
  const [leftoverFailed, setLeftoverFailed] = useState(false);
  const leftoverRetryRef = useRef<(() => Promise<void>) | null>(null);
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

  const speakLeftover = (err: unknown, retry: () => Promise<void>) => {
    console.error('Failed to persist leftover:', err);
    leftoverRetryRef.current = retry;
    setLeftoverFailed(true);
  };

  const clearLeftoverSpeak = () => {
    setLeftoverFailed(false);
    leftoverRetryRef.current = null;
  };

  const parkCurrentLeftover = async (): Promise<boolean> => {
    const aimId = getActiveAimId();
    const leftover = papersRef.current;
    try {
      await parkAim(aimId, leftover.map((paper) => paper.id), leftover);
      clearLeftoverSpeak();
      return true;
    } catch (err) {
      speakLeftover(err, async () => {
        await parkAim(aimId, leftover.map((paper) => paper.id), leftover);
      });
      return false;
    }
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
    console.error('Failed to load papers:', err);
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
      try {
        const next = await replaceLeftover(aim.id, fresh, true);
        if (isStale(gen)) return;
        clearLeftoverSpeak();
        showAimLeftover(next.leftoverCards, true);
      } catch (persistErr) {
        if (isStale(gen)) return;
        speakLeftover(persistErr, async () => {
          const next = await replaceLeftover(aim.id, fresh, true);
          clearLeftoverSpeak();
          showAimLeftover(next.leftoverCards, true);
        });
      }
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
      try {
        const next = await prependRefresh(aim.id, fresh);
        if (isStale(gen)) return;
        clearLeftoverSpeak();
        showAimLeftover(next.leftoverCards, true);
      } catch (persistErr) {
        if (isStale(gen)) return;
        speakLeftover(persistErr, async () => {
          const next = await prependRefresh(aim.id, fresh);
          clearLeftoverSpeak();
          showAimLeftover(next.leftoverCards, true);
        });
      }
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
      try {
        const next = await replaceStackForPoolFlip(current.id, pool, fresh);
        if (isStale(gen)) return;
        pendingFlipPool.current = null;
        clearLeftoverSpeak();
        showAimLeftover(next.leftoverCards, true);
      } catch (persistErr) {
        if (isStale(gen)) return;
        pendingFlipPool.current = pool;
        speakLeftover(persistErr, async () => {
          const next = await replaceStackForPoolFlip(current.id, pool, fresh);
          pendingFlipPool.current = null;
          clearLeftoverSpeak();
          showAimLeftover(next.leftoverCards, true);
        });
      }
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
    try {
      await evictJournaledFromLeftovers();
    } catch (err) {
      if (isStale(gen)) return;
      speakLeftover(err, async () => { await restoreActiveAim(); });
      return;
    }
    const aimId = getActiveAimId();
    let aim;
    try {
      aim = await restoreAim(aimId);
      if (!aim) {
        aim = await ensureGlobalRecent();
        switchActiveAim(aim.id);
      } else {
        setActiveAimIdState(aim.id);
      }
    } catch (err) {
      if (isStale(gen)) return;
      speakLeftover(err, async () => { await restoreActiveAim(); });
      return;
    }
    if (isStale(gen)) return;
    if (shouldFirstFetch(aim)) {
      await replaceActiveStack(gen);
      return;
    }
    showAimLeftover(aim.leftoverCards, aim.lastFetchOk);
    setIsLoading(false);
    setIsRefreshing(false);
    clearLeftoverSpeak();
  };

  const handleSelectAim = async (aimId: string) => {
    const gen = beginPileWork();
    const parked = await parkCurrentLeftover();
    if (!parked) {
      leftoverRetryRef.current = async () => { await handleSelectAim(aimId); };
      return;
    }
    switchActiveAim(aimId);
    try {
      await evictJournaledFromLeftovers();
    } catch (err) {
      speakLeftover(err, async () => { await handleSelectAim(aimId); });
      return;
    }
    let aim;
    try {
      aim = await restoreAim(aimId);
    } catch (err) {
      speakLeftover(err, async () => { await handleSelectAim(aimId); });
      return;
    }
    if (isStale(gen)) return;
    if (!aim || shouldFirstFetch(aim)) {
      setIsLoading(true);
      await replaceActiveStack(gen);
      return;
    }
    showAimLeftover(aim.leftoverCards, aim.lastFetchOk);
    setIsLoading(false);
    setIsRefreshing(false);
    clearLeftoverSpeak();
  };

  const handleSelectRabbitHole = async (topicId: string, topicName: string) => {
    setIsExplorerOpen(false);
    const gen = beginPileWork();
    const parked = await parkCurrentLeftover();
    if (!parked) {
      leftoverRetryRef.current = async () => { await handleSelectRabbitHole(topicId, topicName); };
      return;
    }
    let aim;
    try {
      aim = await ensureTopicAim(topicId, topicName);
      switchActiveAim(aim.id);
      await evictJournaledFromLeftovers();
    } catch (err) {
      speakLeftover(err, async () => { await handleSelectRabbitHole(topicId, topicName); });
      return;
    }
    let restored;
    try {
      restored = await restoreAim(aim.id);
    } catch (err) {
      speakLeftover(err, async () => { await handleSelectRabbitHole(topicId, topicName); });
      return;
    }
    if (isStale(gen)) return;
    if (!restored || shouldFirstFetch(restored)) {
      setIsLoading(true);
      await replaceActiveStack(gen);
      return;
    }
    showAimLeftover(restored.leftoverCards, restored.lastFetchOk);
    setIsLoading(false);
    setIsRefreshing(false);
    clearLeftoverSpeak();
  };

  const persistOpenPlace = async (): Promise<boolean> => {
    if (!readerRef.current) return true;
    return readerRef.current.persistPlaceNow();
  };

  const closeReader = () => {
    void (async () => {
      await persistOpenPlace();
      setSelectedReaderPaper(null);
      if (didSyncFailOnLeave()) setLeaveSyncFailed(true);
    })();
  };

  const runLeavePipeline = async () => {
    await persistOpenPlace();
    await flushJournalPush();
  };

  const handleRetryLeaveSync = async () => {
    if (readerRef.current) {
      const placeOk = await readerRef.current.persistPlaceNow();
      if (!placeOk) return;
    }
    const flushOk = await flushJournalPush();
    if (!flushOk || journalIsDirty() || lastJournalPushFailed()) return;
    clearSyncFailedOnLeave();
    setLeaveSyncFailed(false);
  };

  const pullJournal = async (pat: string, gistId: string): Promise<boolean> => {
    const ok = await pullStateFromGist(pat, gistId);
    if (!ok) console.error('Failed to load the journal.');
    try {
      await evictJournaledFromLeftovers();
    } catch (err) {
      speakLeftover(err, async () => { await evictJournaledFromLeftovers(); });
    }
    return ok;
  };

  const handleRetryJournalPull = async () => {
    const creds = getJournalCreds();
    if (!creds) {
      setJournalPullFailed(false);
      return;
    }
    const ok = await pullJournal(creds.pat, creds.gistId);
    if (!ok) return;
    setJournalPullFailed(false);
    await restoreActiveAim();
  };

  const handleCloudCredentialsSaved = async (pat: string, gistId: string) => {
    if (!pat || !gistId) return;
    const ok = await pullJournal(pat, gistId);
    setJournalPullFailed(!ok);
    await restoreActiveAim();
  };

  const handleRetryLeftover = () => {
    const retry = leftoverRetryRef.current;
    if (!retry) return;
    void retry().catch((err) => {
      console.error('Failed to persist leftover:', err);
    });
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
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void runLeavePipeline();
        return;
      }
      if (document.visibilityState === 'visible' && didSyncFailOnLeave()) {
        setLeaveSyncFailed(true);
      }
    };
    const onPageHide = () => {
      void runLeavePipeline();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  useEffect(() => {
    let active = true;
    initializeDatabase().then(async () => {
      if (!active) return;
      const creds = getJournalCreds();
      let pullOk = true;
      if (creds) {
        pullOk = await pullJournal(creds.pat, creds.gistId);
      }
      if (!active) return;
      await restoreActiveAim();
      if (!pullOk) setJournalPullFailed(true);
    });
    return () => { active = false; };
  }, []);

  const handleSavePaper = async (paper: PaperCard): Promise<boolean> => {
    try {
      await db.savedPapers.put({ ...paper, updatedAt: Date.now() });
      await db.journalTombstones.delete(paper.id);
      const aimId = getActiveAimId();
      await dropFromLeftover(aimId, paper.id);
      const aim = await getAim(aimId);
      const leftover = aim?.leftoverCards ?? papersRef.current.filter((card) => card.id !== paper.id);
      showAimLeftover(leftover, aim?.lastFetchOk ?? true);
      scheduleJournalPush();
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
      scheduleJournalPush();
      return true;
    } catch (err) {
      console.error('Failed to discard paper:', err);
      return false;
    }
  };

  const handleImpliedSave = async (paper: PaperCard) => {
    const aimId = getActiveAimId();
    const aim = await getAim(aimId);
    const leftover = (aim?.leftoverCards ?? papersRef.current).filter((card) => card.id !== paper.id);
    showAimLeftover(leftover, aim?.lastFetchOk ?? true);
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
      await db.transaction(
        'rw',
        [db.savedPapers, db.notes, db.pdfCache, db.contentCache, db.readingPlaces, db.journalTombstones],
        async () => {
          await db.savedPapers.delete(paperId);
          await db.notes.where('paperId').equals(paperId).delete();
          await db.pdfCache.delete(paperId);
          await db.contentCache.delete(paperId);
          await db.readingPlaces.delete(paperId);
          await db.journalTombstones.put({ id: paperId, deletedAt: Date.now() });
        },
      );
      scheduleJournalPush();
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
      clearSyncFailedOnLeave();
      setLeaveSyncFailed(false);
      setJournalPullFailed(false);
      clearLeftoverSpeak();
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
        {journalPullFailed && (
          <SpokenNotice
            message={SPOKEN.journalPullFailed}
            onRetry={() => { void handleRetryJournalPull(); }}
          />
        )}
        {leaveSyncFailed && (
          <SpokenNotice
            message={SPOKEN.journalSyncFailed}
            onRetry={() => { void handleRetryLeaveSync(); }}
          />
        )}
        {leftoverFailed && (
          <SpokenNotice
            message={SPOKEN.leftoverFailed}
            onRetry={handleRetryLeftover}
          />
        )}
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
          ref={readerRef}
          paper={selectedReaderPaper}
          apiKey={apiKey}
          onClose={closeReader}
          onPaperUpdated={handlePaperUpdated}
          onImpliedSave={handleImpliedSave}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          apiKey={apiKey}
          onSaveApiKey={handleSaveApiKey}
          sources={sources}
          onResetDatabase={handleResetDatabase}
          onCloudCredentialsSaved={handleCloudCredentialsSaved}
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
