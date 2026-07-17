'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { getConsent, setConsent, type ConsentLevel } from '@/lib/consent';

/**
 * First-party consent banner (no external consent vendor). Honest scope:
 * the site sets no ad or third-party trackers at all — the only optional
 * item is an anonymous local-storage session id used for aggregate reading
 * statistics. "Essential only" is a first-class, equally prominent choice.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getConsent() === null);
  }, []);

  const choose = (level: ConsentLevel) => {
    setConsent(level);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          role="dialog"
          aria-label="Privacy choices"
          className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6"
        >
          <div className="mx-auto flex max-w-[900px] flex-col items-start gap-3 rounded-2xl border border-border/10 bg-bg-2 p-4 shadow-pop sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-text-secondary">
              <span className="font-semibold text-text-primary">Your privacy.</span> Apolitics runs no
              ads and no third-party trackers. We&apos;d like to keep an anonymous session id in your
              browser for aggregate reading statistics — nothing else.{' '}
              <Link href="/cookies" className="text-brand-text hover:underline">
                Cookie policy
              </Link>
            </p>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={() => choose('essential')}
                className="rounded-full border border-border/10 bg-bg-3 px-4 py-2 text-[12px] font-medium text-text-secondary transition-colors hover:bg-bg-4"
              >
                Essential only
              </button>
              <button
                onClick={() => choose('all')}
                className="rounded-full bg-brand px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                Accept
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
