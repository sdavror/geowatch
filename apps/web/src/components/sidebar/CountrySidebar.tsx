'use client';

import { useCountry } from '@/hooks/useCountries';
import { StatusBadge } from './StatusBadge';
import { RiskScoreBar } from './RiskScoreBar';
import { EventTimeline } from './EventTimeline';

interface CountrySidebarProps {
  countryId: string | null;
  onClose: () => void;
}

export function CountrySidebar({ countryId, onClose }: CountrySidebarProps) {
  const { country, isLoading, isError } = useCountry(countryId);

  if (!countryId) {
    return (
      <aside className="flex w-0 flex-col overflow-hidden border-l border-border/10 bg-bg-2 transition-all" />
    );
  }

  return (
    <aside className="flex w-80 flex-shrink-0 flex-col overflow-hidden border-l border-border/10 bg-bg-2">
      <div className="flex items-center justify-between border-b border-border/10 px-4 py-3.5">
        <span className="text-sm font-semibold">Country Details</span>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-bg-3 hover:text-text-primary"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3.5">
        {isLoading && (
          <div className="space-y-3">
            <div className="h-8 w-8 animate-pulse rounded-full bg-bg-3" />
            <div className="h-4 w-32 animate-pulse rounded bg-bg-3" />
            <div className="h-3 w-24 animate-pulse rounded bg-bg-3" />
          </div>
        )}

        {isError && (
          <p className="text-xs text-status-conflict">
            Failed to load country details. Please try again.
          </p>
        )}

        {country && !isLoading && (
          <>
            <div className="mb-1 text-3xl">{country.flagEmoji}</div>
            <h2 className="mb-1 text-lg font-bold">{country.name}</h2>
            <p className="mb-3 text-xs text-text-tertiary">
              {country.region} · Capital: {country.capital}
            </p>

            <div className="mb-4">
              <StatusBadge status={country.status} />
            </div>

            <div className="mb-4">
              <RiskScoreBar score={country.riskScore} />
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/10 bg-bg-3 p-2 text-center">
                <div className="text-lg font-bold">{country.riskScore.toFixed(1)}</div>
                <div className="text-[10px] text-text-tertiary">Risk Score</div>
              </div>
              <div className="rounded-lg border border-border/10 bg-bg-3 p-2 text-center">
                <div className="text-lg font-bold">{country.events.length}</div>
                <div className="text-[10px] text-text-tertiary">Recent Events</div>
              </div>
            </div>

            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
              Recent Events
            </div>
            <EventTimeline events={country.events} />

            {country.recentArticles.length > 0 && (
              <>
                <div className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                  Related News
                </div>
                <div className="flex flex-col gap-2">
                  {country.recentArticles.map((article) => (
                    <a
                      key={article.id}
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-border/10 bg-bg-3 p-2.5 text-xs text-text-primary hover:bg-bg-4"
                    >
                      {article.title}
                    </a>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
