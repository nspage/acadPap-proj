import { useState } from 'react';
import { RepositoryConfig } from '../../types';
import { X, Key, Database, Sparkles, Check, RefreshCw, ShieldCheck, Cloud } from 'lucide-react';

interface SettingsModalProps {
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  sources: RepositoryConfig[];
  onResetDatabase: () => void;
  onClose: () => void;
}

export function SettingsModal({
  apiKey,
  onSaveApiKey,
  sources,
  onResetDatabase,
  onClose,
}: SettingsModalProps) {
  const [inputKey, setInputKey] = useState(apiKey);
  const [savedKey, setSavedKey] = useState(false);
  
  const [githubPat, setGithubPat] = useState(() => localStorage.getItem('github_pat') || '');
  const [gistId, setGistId] = useState(() => localStorage.getItem('gist_id') || '');
  const [savedCloud, setSavedCloud] = useState(false);
  
  const [filterGeo, setFilterGeo] = useState(() => localStorage.getItem('filter_geo') === 'true');
  const [filterImpact, setFilterImpact] = useState(() => localStorage.getItem('filter_impact') === 'true');

  const toggleGeo = () => {
    const next = !filterGeo;
    setFilterGeo(next);
    localStorage.setItem('filter_geo', next.toString());
  };

  const toggleImpact = () => {
    const next = !filterImpact;
    setFilterImpact(next);
    localStorage.setItem('filter_impact', next.toString());
  };

  const handleCloudSave = () => {
    localStorage.setItem('github_pat', githubPat.trim());
    localStorage.setItem('gist_id', gistId.trim());
    setSavedCloud(true);
    setTimeout(() => setSavedCloud(false), 2000);
  };

  const handleKeySave = () => {
    onSaveApiKey(inputKey.trim());
    setSavedKey(true);
    setTimeout(() => setSavedKey(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" /> Settings & Data Sources
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Cloud Sync Section */}
          <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
            <label className="block text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5" /> Cloud Sync (Gist Backend)
            </label>
            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              Enable cross-device sync by providing a GitHub Personal Access Token (classic, `gist` scope) and a private Gist ID.
            </p>
            <div className="flex flex-col space-y-2">
              <input
                type="password"
                value={githubPat}
                onChange={(e) => setGithubPat(e.target.value)}
                placeholder="GitHub PAT (ghp_...)"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={gistId}
                  onChange={(e) => setGistId(e.target.value)}
                  placeholder="Private Gist ID"
                  className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleCloudSave}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 transition-all"
                >
                  {savedCloud ? <Check className="w-4 h-4" /> : 'Save'}
                </button>
              </div>
            </div>
          </div>

          {/* Gemini API Key Section */}
          <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
            <label className="block text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5" /> Gemini API Key (Optional)
            </label>
            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              Required for context-aware AI explanations in the deep reader using `@google/genai` (`gemini-2.5-flash`).
            </p>
            <div className="flex items-center space-x-2">
              <input
                type="password"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleKeySave}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 transition-all"
              >
                {savedKey ? <Check className="w-4 h-4" /> : 'Save'}
              </button>
            </div>
          </div>

          {/* OpenAlex Quality Filters */}
          <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
            <label className="block text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Discovery Quality Filters
            </label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-200">Top Research Regions</div>
                  <div className="text-[11px] text-slate-400">Limit to North America, Europe, and top Asian hubs</div>
                </div>
                <button
                  onClick={toggleGeo}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filterGeo
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'bg-slate-800 text-slate-500 border border-slate-700'
                  }`}
                >
                  {filterGeo ? 'Active' : 'Disabled'}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-200">Proven Impact Baseline</div>
                  <div className="text-[11px] text-slate-400">Require minimum 5 citations to surface in feed</div>
                </div>
                <button
                  onClick={toggleImpact}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filterImpact
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'bg-slate-800 text-slate-500 border border-slate-700'
                  }`}
                >
                  {filterImpact ? 'Active' : 'Disabled'}
                </button>
              </div>
            </div>
          </div>

          {/* Active Repository Data Sources */}
          <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
            <label className="block text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" /> Academic Preprint Repositories
            </label>
            <div className="space-y-2">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-200">{source.name}</div>
                    <div className="text-[11px] text-slate-400">{source.category}</div>
                  </div>

                  <button
                    type="button"
                    disabled
                    className={`px-3 py-1 rounded-lg text-xs font-medium cursor-not-allowed opacity-60 ${
                      source.enabled
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}
                  >
                    {source.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Reset Local Database */}
          <div className="pt-2 flex justify-between items-center">
            <button
              onClick={onResetDatabase}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Clear Local Cache & Reset
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
