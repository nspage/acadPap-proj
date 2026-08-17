import { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useOverlayLock } from '../../lib/use-overlay-lock';

interface OverlayFrameProps {
  onClose: () => void;
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}

export function OverlayFrame({ onClose, title, actions, children, wide }: OverlayFrameProps) {
  useOverlayLock(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/85 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex flex-col w-full bg-slate-900 shadow-2xl overflow-hidden sm:border sm:border-slate-800 sm:rounded-3xl ${
          wide ? 'max-w-5xl' : 'max-w-lg'
        } h-[100dvh] sm:h-auto sm:max-h-[min(90dvh,52rem)] pt-[max(3.5rem,env(safe-area-inset-top))] sm:pt-0`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 px-3 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 active:scale-[0.98]"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
          {title && <div className="flex-1 min-w-0">{title}</div>}
          {actions}
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </div>
        <div
          className="sm:hidden shrink-0 border-t border-slate-800 px-3 pt-2"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-12 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:scale-[0.99]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
