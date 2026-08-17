import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { PaperCard, PileStatus } from '../../types';
import { PaperCardItem } from './PaperCardItem';
import { SpokenNotice, SPOKEN } from '../common/SpokenNotice';
import { X, Heart, Keyboard, CheckCircle2, RotateCcw } from 'lucide-react';

interface SwipeDeckProps {
  papers: PaperCard[];
  pileStatus: PileStatus;
  onSave: (paper: PaperCard) => void | Promise<boolean>;
  onDiscard: (paper: PaperCard) => void | Promise<boolean>;
  onOpen: (paper: PaperCard) => void;
  onRefresh: () => void;
  onRetryPile: () => void;
}

function flyDistance(dir: 'left' | 'right'): number {
  const width = typeof window === 'undefined' ? 500 : window.innerWidth;
  return (dir === 'right' ? 1 : -1) * (width + 160);
}

export function SwipeDeck({ papers, pileStatus, onSave, onDiscard, onOpen, onRefresh, onRetryPile }: SwipeDeckProps) {
  const [deck, setDeck] = useState<PaperCard[]>([]);
  const [swipedDir, setSwipedDir] = useState<'left' | 'right' | null>(null);
  const [actionNotice, setActionNotice] = useState<'save' | 'discard' | null>(null);
  const lastDragX = useRef(0);
  const busyRef = useRef(false);
  const inflightId = useRef<string | null>(null);
  const x = useMotionValue(0);

  const rotate = useTransform(x, [-200, 200], [-18, 18]);
  const opacitySave = useTransform(x, [50, 150], [0, 1]);
  const opacityDiscard = useTransform(x, [-150, -50], [1, 0]);

  const papersKey = papers.map((paper) =>
    `${paper.id}:${paper.unreadableStampedAt ?? ''}:${paper.hasGrobidXml === false ? 0 : 1}:${paper.unreadable ? 1 : 0}`,
  ).join('|');

  useEffect(() => {
    setDeck(papers.filter((paper) => paper.id !== inflightId.current));
  }, [papersKey]);

  const activeCard = deck[0];

  useLayoutEffect(() => {
    x.set(0);
    lastDragX.current = 0;
  }, [activeCard?.id]);

  const commit = async (dir: 'left' | 'right') => {
    if (!activeCard || busyRef.current) return;
    const card = activeCard;
    busyRef.current = true;
    inflightId.current = card.id;
    setSwipedDir(dir);
    setActionNotice(null);

    await animate(x, flyDistance(dir), { duration: 0.22, ease: 'easeOut' });
    setDeck((prev) => prev.filter((paper) => paper.id !== card.id));

    const ok = dir === 'right' ? await onSave(card) : await onDiscard(card);
    inflightId.current = null;
    busyRef.current = false;
    setSwipedDir(null);

    if (ok === false) {
      setDeck((prev) => [card, ...prev.filter((paper) => paper.id !== card.id)]);
      setActionNotice(dir === 'right' ? 'save' : 'discard');
      return;
    }
    setActionNotice(null);
  };

  const handleSwipeRight = () => { void commit('right'); };
  const handleSwipeLeft = () => { void commit('left'); };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid triggering when user is typing in input fields
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'h') {
        e.preventDefault();
        handleSwipeLeft();
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'l') {
        e.preventDefault();
        handleSwipeRight();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCard]);

  if (deck.length === 0) {
    if (pileStatus !== 'caught_up') {
      return (
        <SpokenNotice
          message={pileStatus === 'quota' ? SPOKEN.quota : SPOKEN.pileFailed}
          onRetry={onRetryPile}
        />
      );
    }

    return (
      <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto my-12 bg-slate-900/60 border border-slate-800 rounded-3xl backdrop-blur-xl">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4 ring-1 ring-indigo-500/20">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">You're All Caught Up!</h3>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          You've reviewed all paper preprints in your discovery queue.
        </p>
        <button
          onClick={onRefresh}
          className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-sm shadow-lg shadow-indigo-500/25 transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reshuffle & Load Fresh Papers</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto px-4 py-4">
      {(pileStatus === 'failed' || pileStatus === 'quota') && (
        <SpokenNotice
          message={pileStatus === 'quota' ? SPOKEN.quota : SPOKEN.pileFailed}
          onRetry={onRetryPile}
        />
      )}
      {actionNotice === 'save' && (
        <SpokenNotice
          message={SPOKEN.saveFailed}
          onRetry={() => { void handleSwipeRight(); }}
        />
      )}
      {actionNotice === 'discard' && (
        <SpokenNotice
          message={SPOKEN.discardFailed}
          onRetry={() => { void handleSwipeLeft(); }}
        />
      )}
      {/* Card Stack Container */}
      <div className="relative w-full min-h-[480px] h-[65vh] max-h-[600px] md:h-[75vh] md:max-h-[750px] flex items-center justify-center overflow-x-clip">
        {deck.slice(0, 3).map((paper, index) => {
            const isTop = index === 0;
            const flying = isTop && swipedDir != null;
            return (
              <motion.div
                key={paper.id}
                style={{
                  zIndex: deck.length - index,
                  x: isTop ? x : 0,
                  rotate: isTop ? rotate : 0,
                }}
                drag={isTop && !flying ? 'x' : false}
                dragDirectionLock
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.9}
                dragSnapToOrigin={!flying}
                onDragEnd={(_, info) => {
                  lastDragX.current = info.offset.x;
                  const goRight = info.offset.x > 80 || info.velocity.x > 600;
                  const goLeft = info.offset.x < -80 || info.velocity.x < -600;
                  if (goRight) {
                    handleSwipeRight();
                  } else if (goLeft) {
                    handleSwipeLeft();
                  } else {
                    void animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 });
                  }
                }}
                onClick={(e) => {
                  if (!isTop || flying) return;
                  if (Math.abs(lastDragX.current) > 10) {
                    lastDragX.current = 0;
                    return;
                  }
                  const target = e.target as HTMLElement;
                  if (target.closest('button, a')) return;
                  onOpen(paper);
                }}
                initial={{ scale: 1 - index * 0.05, y: index * 12, opacity: 1 - index * 0.2 }}
                animate={{ scale: 1 - index * 0.05, y: index * 12, opacity: 1 - index * 0.2 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="absolute top-0 left-0 w-full h-full cursor-grab active:cursor-grabbing"
              >
                {/* Swipe Direction Indicators for Top Card */}
                {isTop && (
                  <>
                    <motion.div
                      style={{ opacity: opacitySave }}
                      className="absolute top-6 left-6 z-20 px-4 py-2 border-2 border-emerald-400 text-emerald-400 font-extrabold text-lg rounded-xl tracking-wider uppercase bg-emerald-950/80 backdrop-blur pointer-events-none transform -rotate-12 shadow-lg"
                    >
                      SAVE
                    </motion.div>

                    <motion.div
                      style={{ opacity: opacityDiscard }}
                      className="absolute top-6 right-6 z-20 px-4 py-2 border-2 border-rose-500 text-rose-500 font-extrabold text-lg rounded-xl tracking-wider uppercase bg-rose-950/80 backdrop-blur pointer-events-none transform rotate-12 shadow-lg"
                    >
                      DISCARD
                    </motion.div>
                  </>
                )}

                <PaperCardItem
                  paper={paper}
                  onSave={handleSwipeRight}
                  onDiscard={handleSwipeLeft}
                  onOpen={() => onOpen(paper)}
                  isTopCard={isTop}
                />
              </motion.div>
            );
          })}
      </div>

      {/* Swipe Action Control Buttons */}
      <div className="flex items-center justify-center gap-6 mt-6">
        <button
          onClick={handleSwipeLeft}
          title="Discard Paper (Left Arrow / H)"
          className="w-14 h-14 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center shadow-lg shadow-rose-500/10 hover:scale-105 active:scale-95 transition-all"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="hidden sm:flex items-center space-x-1 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-mono">
          <Keyboard className="w-3.5 h-3.5 text-slate-500" />
          <span>← / H or → / L</span>
        </div>

        <button
          onClick={handleSwipeRight}
          title="Save (Right Arrow / L)"
          className="w-14 h-14 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10 hover:scale-105 active:scale-95 transition-all"
        >
          <Heart className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
