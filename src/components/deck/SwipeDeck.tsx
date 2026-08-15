import { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { PaperCard } from '../../types';
import { PaperCardItem } from './PaperCardItem';
import { X, Heart, Sparkles, Keyboard, CheckCircle2, RotateCcw } from 'lucide-react';

interface SwipeDeckProps {
  papers: PaperCard[];
  onSave: (paper: PaperCard) => void;
  onDiscard: (paper: PaperCard) => void;
  onRefresh: () => void;
}

export function SwipeDeck({ papers, onSave, onDiscard, onRefresh }: SwipeDeckProps) {
  const [deck, setDeck] = useState<PaperCard[]>([]);
  const x = useMotionValue(0);

  // Motion physics calculations for swipe gestures
  const rotate = useTransform(x, [-200, 200], [-18, 18]);
  const opacitySave = useTransform(x, [50, 150], [0, 1]);
  const opacityDiscard = useTransform(x, [-150, -50], [1, 0]);

  useEffect(() => {
    setDeck(papers);
  }, [papers]);

  const activeCard = deck[0];

  const handleSwipeRight = () => {
    if (!activeCard) return;
    onSave(activeCard);
    setDeck((prev) => prev.slice(1));
  };

  const handleSwipeLeft = () => {
    if (!activeCard) return;
    onDiscard(activeCard);
    setDeck((prev) => prev.slice(1));
  };

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
  }, [deck]);

  if (deck.length === 0) {
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
    <div className="flex flex-col items-center w-full max-w-md mx-auto px-4 py-4">
      {/* Card Stack Container */}
      <div className="relative w-full h-[520px] flex items-center justify-center">
        <AnimatePresence>
          {deck.slice(0, 3).map((paper, index) => {
            const isTop = index === 0;
            return (
              <motion.div
                key={paper.id}
                style={{
                  zIndex: deck.length - index,
                  x: isTop ? x : 0,
                  rotate: isTop ? rotate : 0,
                }}
                drag={isTop ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 100) {
                    handleSwipeRight();
                  } else if (info.offset.x < -100) {
                    handleSwipeLeft();
                  }
                }}
                initial={{ scale: 1 - index * 0.05, y: index * 12, opacity: 1 - index * 0.2 }}
                animate={{ scale: 1 - index * 0.05, y: index * 12, opacity: 1 - index * 0.2 }}
                exit={{ x: x.get() < 0 ? -300 : 300, opacity: 0, transition: { duration: 0.25 } }}
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
                      SAVE & READ
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
                  onSaveAndRead={handleSwipeRight}
                  onDiscard={handleSwipeLeft}
                  isTopCard={isTop}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
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

        <div className="flex items-center space-x-1 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-mono">
          <Keyboard className="w-3.5 h-3.5 text-slate-500" />
          <span>← / H or → / L</span>
        </div>

        <button
          onClick={handleSwipeRight}
          title="Save & Deep Read (Right Arrow / L)"
          className="w-14 h-14 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10 hover:scale-105 active:scale-95 transition-all"
        >
          <Heart className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
