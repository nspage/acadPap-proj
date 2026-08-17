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
