import { useState, useEffect } from 'react';
import { PaperCard, PaperNote, RepositoryConfig } from './types';
import { db, initializeDatabase, DEFAULT_SOURCES } from './lib/db';
import { fetchAllEnabledPapers } from './services/adapters';
import { Header } from './components/common/Header';
import { SwipeDeck } from './components/deck/SwipeDeck';
import { JournalView } from './components/journal/JournalView';
import { ReaderModal } from './components/reader/ReaderModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { useLiveQuery } from 'dexie-react-hooks';
import { Loader2 } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'discover' | 'journal'>('discover');
  const [papers, setPapers] = useState<PaperCard[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [selectedReaderPaper, setSelectedReaderPaper] = useState<PaperCard | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');

  // Dexie live reactive queries
  const savedPapers = useLiveQuery(() => db.savedPapers.toArray(), []) || [];
  const notes = useLiveQuery(() => db.notes.toArray(), []) || [];
  const dbSources = useLiveQuery(() => db.sources.toArray(), []) || [];

  const sources = dbSources.length > 0 ? dbSources : DEFAULT_SOURCES;

  useEffect(() => {
    initializeDatabase();
  }, []);

  const loadFeed = async () => {
    setIsLoading(true);
    try {
      const activeSources = sources.filter((s) => s.enabled);
      const fetched = await fetchAllEnabledPapers(activeSources);

      // Exclude already discarded or saved papers
      const savedIds = new Set((await db.savedPapers.toArray()).map((p) => p.id));
      const discardedIds = new Set((await db.discardedIds.toArray()).map((d) => d.id));

      const freshPapers = fetched.filter((p) => !savedIds.has(p.id) && !discardedIds.has(p.id));
      setPapers(freshPapers);
    } catch (err) {
      console.error('Failed to load feed:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (sources.length > 0) {
      loadFeed();
    }
  }, [sources.map((s) => `${s.id}:${s.enabled}`).join(',')]);

  const handleSavePaper = async (paper: PaperCard) => {
    try {
      await db.savedPapers.put(paper);
      // Automatically open Deep Reader modal when swiped right
      setSelectedReaderPaper(paper);
    } catch (err) {
      console.error('Failed to save paper:', err);
    }
  };

  const handleDiscardPaper = async (paper: PaperCard) => {
    try {
      await db.discardedIds.put({ id: paper.id, discardedAt: Date.now() });
    } catch (err) {
      console.error('Failed to discard paper:', err);
    }
  };

  const handleRemoveSavedPaper = async (paperId: string) => {
    try {
      await db.savedPapers.delete(paperId);
      await db.notes.where('paperId').equals(paperId).delete();
      await db.pdfCache.delete(paperId);
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
      await db.sources.clear();
      await db.sources.bulkAdd(DEFAULT_SOURCES);
      loadFeed();
    }
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
          loadFeed();
        }}
        isRefreshing={isRefreshing}
        savedCount={savedPapers.length}
      />

      {/* Main View Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        {activeTab === 'discover' ? (
          isLoading ? (
            <div className="flex flex-col items-center justify-center space-y-3 p-12">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-xs text-slate-400 font-mono">Aggregation & Serendipity Shuffling...</p>
            </div>
          ) : (
            <SwipeDeck
              papers={papers}
              onSave={handleSavePaper}
              onDiscard={handleDiscardPaper}
              onRefresh={loadFeed}
            />
          )
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
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}
