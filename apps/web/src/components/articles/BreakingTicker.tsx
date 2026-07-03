'use client';

import type { Article } from '@geowatch/shared-types';

interface BreakingTickerProps {
  articles: Article[];
}

export function BreakingTicker({ articles }: BreakingTickerProps) {
  if (!articles.length) return null;

  const items = [...articles, ...articles];

  return (
    <div className="flex items-center overflow-hidden" style={{ backgroundColor: 'rgb(83 74 183)' }}>
      <div className="z-10 flex-shrink-0 px-4 py-2" style={{ backgroundColor: 'rgb(83 74 183)' }}>
        <span
          className="rounded px-2 py-0.5 text-[9px] font-bold tracking-widest text-white"
          style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
        >
          BREAKING
        </span>
      </div>

      <div className="relative flex-1 overflow-hidden py-2">
        <div
          className="flex whitespace-nowrap"
          style={{ animation: 'ticker-scroll 40s linear infinite' }}
        >
          {items.map((a, i) => (
            <span key={`${a.id}-${i}`} className="flex items-center text-[12px] font-medium text-white">
              {a.title}
              <span className="mx-6 opacity-40">·</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
