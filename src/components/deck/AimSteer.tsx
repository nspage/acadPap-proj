import { Compass } from 'lucide-react';
import { Aim, Pool } from '../../types';
import { sortAimsForChips } from '../../services/aim-store';

interface AimSteerProps {
  aims: Aim[];
  activeAimId: string;
  pool: Pool;
  onSelectAim: (aimId: string) => void;
  onFlipPool: (pool: Pool) => void;
  onDive: () => void;
}

export function AimSteer({
  aims,
  activeAimId,
  pool,
  onSelectAim,
  onFlipPool,
  onDive,
}: AimSteerProps) {
  const chips = sortAimsForChips(aims);

  return (
    <div className="w-full flex flex-col space-y-3 pb-2 mb-4 px-2 border-b border-slate-800/60">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Saved Explorations</span>
        <button
          type="button"
          onClick={onDive}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-lg transition-all"
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Dive New Rabbit Hole</span>
        </button>
      </div>

      <div className="flex items-center space-x-2 overflow-x-auto pb-3 custom-scrollbar w-full snap-x">
        {chips.map((aim) => {
          const active = aim.id === activeAimId;
          return (
            <button
              key={aim.id}
              type="button"
              onClick={() => onSelectAim(aim.id)}
              className={`shrink-0 snap-start px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                active
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {aim.name}
            </button>
          );
        })}
      </div>

      <div className="w-full flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] text-slate-500 font-medium">Pool</span>
        <div className="flex items-center p-0.5 rounded-full bg-slate-900 border border-slate-800">
          <button
            type="button"
            onClick={() => onFlipPool('recent')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
              pool === 'recent' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Recent
          </button>
          <button
            type="button"
            onClick={() => onFlipPool('cited')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
              pool === 'cited' ? 'bg-slate-800 text-amber-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Cited
          </button>
        </div>
      </div>
    </div>
  );
}
