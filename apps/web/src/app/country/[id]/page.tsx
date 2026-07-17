'use client';

import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useCountry } from '@/hooks/useCountries';
import { useCountryScore, useConflictSeries, useTradePartners } from '@/hooks/useMacroScores';
import { Navbar } from '@/components/nav/Navbar';
import { Footer } from '@/components/nav/Footer';
import { StatusBadge } from '@/components/sidebar/StatusBadge';
import { RiskScoreBar } from '@/components/sidebar/RiskScoreBar';
import { GdpIndicator } from '@/components/sidebar/GdpIndicator';
import { PopulationIndicator } from '@/components/sidebar/PopulationIndicator';
import { EventTimeline } from '@/components/sidebar/EventTimeline';
import { AreaChart, BarList } from '@/components/charts';
import { StoryCard, staggerContainer } from '@/components/article/StoryCard';
import type { Article } from '@geowatch/shared-types';

// Matches the component keys MacroService writes: `${source}:${indicatorCode}`
// for World Bank/IMF indicators, plus the flat 'sanctions' key.
const COMPONENT_LABEL: Record<string, string> = {
  'WB:NY.GNP.PCAP.PP.CD': 'GNI per capita (PPP)',
  'WB:NY.GDP.MKTP.KD.ZG': 'GDP growth',
  'WB:FP.CPI.TOTL.ZG': 'Inflation',
  'WB:SL.UEM.TOTL.ZS': 'Unemployment',
  'WB:GC.DOD.TOTL.GD.ZS': 'Government debt',
  'WB:BX.KLT.DINV.WD.GD.ZS': 'Foreign direct investment',
  'WB:SI.POV.GINI': 'Income inequality (Gini)',
  'IMF:NGDP_RPCH': 'GDP growth forecast (IMF)',
  sanctions: 'Sanctions pressure',
};

export default function CountryPage() {
  const router = useRouter();
  const params = useParams();
  const id = (typeof params.id === 'string' ? params.id : params.id?.[0] ?? '').toUpperCase();

  const { country, isLoading, isError } = useCountry(id || null);
  const { score } = useCountryScore(id || null);
  const { conflict } = useConflictSeries(id || null);
  const { trade } = useTradePartners(id || null);

  const openArticle = (a: Article) => router.push(`/news/${a.id}`);

  return (
    <div className="min-h-screen bg-bg">
      <Navbar active={null} search="" onSearch={() => {}} />

      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
        {isLoading && (
          <div className="space-y-4">
            <div className="skeleton h-10 w-64 rounded-lg" />
            <div className="skeleton h-40 w-full rounded-2xl" />
          </div>
        )}

        {isError && (
          <p className="rounded-xl bg-status-conflict/10 px-4 py-3 text-sm text-status-conflict">
            Failed to load this country. It may not exist in our dataset.
          </p>
        )}

        {country && !isLoading && (
          <>
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/10 pb-6">
              <div className="flex items-center gap-4">
                <span className="text-5xl">{country.flagEmoji}</span>
                <div>
                  <h1 className="text-h1 text-text-primary">{country.name}</h1>
                  <p className="mt-1 text-caption text-text-tertiary">
                    {country.region} · Capital: {country.capital}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={country.status} />
                <button
                  onClick={() => router.push('/map')}
                  className="text-caption text-text-tertiary transition-colors hover:text-brand-text"
                >
                  View on world map ›
                </button>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
              {/* Main column */}
              <div className="min-w-0 space-y-8">
                <section>
                  <RiskScoreBar score={country.riskScore} />
                </section>

                {score && (
                  <section>
                    <div className="mb-3 flex items-baseline justify-between">
                      <h2 className="text-h2 text-text-primary">Country Health</h2>
                      <span className="text-caption text-text-tertiary">
                        Apolitics index · {score.history[score.history.length - 1]?.value.toFixed(0)}/100
                      </span>
                    </div>
                    <AreaChart
                      data={score.history.map((h) => ({ label: h.period.slice(0, 10), value: Math.round(h.value) }))}
                      color="#2563EB"
                    />
                    {score.latestComponents && (
                      <div className="mt-4">
                        <BarList
                          rows={Object.entries(score.latestComponents).map(([k, v]) => ({
                            label: COMPONENT_LABEL[k] ?? k,
                            value: Math.round(v),
                          }))}
                          color="#2563EB"
                        />
                      </div>
                    )}
                  </section>
                )}

                {conflict && conflict.months.length > 0 && (
                  <section>
                    <div className="mb-3 flex items-baseline justify-between">
                      <h2 className="text-h2 text-text-primary">Conflict trend</h2>
                      <span className="text-caption text-text-tertiary">
                        Trailing 12m: {conflict.trailing12m.events.toLocaleString('en-US')} events ·{' '}
                        {conflict.trailing12m.deaths.toLocaleString('en-US')} deaths
                      </span>
                    </div>
                    <AreaChart
                      data={conflict.months.slice(-24).map((m) => ({ label: m.month, value: m.events }))}
                      color="#e84545"
                    />
                    <p className="mt-2 text-caption text-text-tertiary">
                      Monthly events, UCDP Georeferenced Event Dataset — last 24 months.
                    </p>
                  </section>
                )}

                <section>
                  <h2 className="mb-3 text-h2 text-text-primary">Recent events</h2>
                  <EventTimeline events={country.events} />
                </section>

                {country.recentArticles.length > 0 && (
                  <section>
                    <h2 className="mb-3 text-h2 text-text-primary">Related coverage</h2>
                    <motion.div
                      initial="hidden"
                      animate="visible"
                      variants={staggerContainer}
                      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                    >
                      {country.recentArticles.slice(0, 6).map((a) => (
                        <StoryCard key={a.id} article={a} onOpen={openArticle} size="compact" />
                      ))}
                    </motion.div>
                  </section>
                )}
              </div>

              {/* Sidebar */}
              <aside className="flex flex-col gap-6">
                <div className="rounded-2xl border border-border/10 bg-bg-2 p-4">
                  <div className="flex flex-col gap-3">
                    <PopulationIndicator countryId={country.id} />
                    <GdpIndicator gdpUsd={country.gdpUsd} />
                  </div>
                </div>

                {trade && (trade.exports.length > 0 || trade.imports.length > 0) && (
                  <div className="rounded-2xl border border-border/10 bg-bg-2 p-4">
                    <div className="mb-2 flex items-center justify-between text-caption">
                      <span className="font-semibold text-text-primary">Top trade partners</span>
                      <span className="text-text-tertiary">{trade.year} · Comtrade</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-text-tertiary">
                          Exports to
                        </div>
                        <BarList
                          rows={trade.exports.slice(0, 5).map((p) => ({
                            label: `${p.flagEmoji ?? '🌐'} ${p.partnerName}`,
                            value: Math.round(p.valueUsd / 1_000_000),
                          }))}
                          valueSuffix="M"
                          color="#3ecf8e"
                        />
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-wide text-text-tertiary">
                          Imports from
                        </div>
                        <BarList
                          rows={trade.imports.slice(0, 5).map((p) => ({
                            label: `${p.flagEmoji ?? '🌐'} ${p.partnerName}`,
                            value: Math.round(p.valueUsd / 1_000_000),
                          }))}
                          valueSuffix="M"
                          color="#f28c2a"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
