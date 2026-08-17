/** Named-failure copy. Do not invent banners beyond the spec's spoken-state rules. */
export const SPOKEN = {
  pileFailed: "Couldn't load papers.",
  quota: 'Cap is used, come back later.',
  saveFailed: "Couldn't save the paper.",
  discardFailed: "Couldn't discard the paper.",
  leftoverFailed: "Couldn't keep the leftover pile.",
  noteFailed: "Couldn't save the note.",
  brokenRead: "Couldn't get the text",
  journalPullFailed: "Couldn't load the journal.",
  journalSyncFailed: "Couldn't sync the journal.",
} as const;

interface SpokenNoticeProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function SpokenNotice({ message, onRetry, retryLabel = 'Retry' }: SpokenNoticeProps) {
  return (
    <div className="w-full max-w-md mx-auto my-6 px-5 py-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-center">
      <p className="text-sm text-slate-200 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
