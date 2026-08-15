import { Compass, BookOpen, Settings, RefreshCw, Sparkles } from 'lucide-react';

interface HeaderProps {
  activeTab: 'discover' | 'journal';
  onTabChange: (tab: 'discover' | 'journal') => void;
  onOpenSettings: () => void;
  onRefreshFeed: () => void;
  isRefreshing?: boolean;
  savedCount: number;
}

export function Header({
  activeTab,
  onTabChange,
  onOpenSettings,
  onRefreshFeed,
  isRefreshing,
  savedCount,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 w-full bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              Serendipity <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-mono border border-indigo-500/20">PWA</span>
            </h1>
            <p className="text-xs text-slate-400">Local-First Academic Discovery</p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <nav className="flex items-center p-1 bg-slate-900/90 rounded-xl border border-slate-800">
          <button
            onClick={() => onTabChange('discover')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'discover'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Discover</span>
          </button>
          <button
            onClick={() => onTabChange('journal')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'journal'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Journal</span>
            {savedCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-indigo-400/20 text-indigo-300 text-[10px] font-mono">
                {savedCount}
              </span>
            )}
          </button>
        </nav>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {activeTab === 'discover' && (
            <button
              onClick={onRefreshFeed}
              disabled={isRefreshing}
              title="Reshuffle & Refresh Feed"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          )}

          <button
            onClick={onOpenSettings}
            title="Settings & Data Sources"
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
