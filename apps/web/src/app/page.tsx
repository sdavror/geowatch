'use client';

import { useHealth } from '@/lib/useHealth';
import { StatusPill } from '@/components/StatusPill';

export default function HomePage() {
  const { health, isLoading, isError } = useHealth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-status-conflict" />
        <h1 className="text-2xl font-semibold tracking-wide">GEOWATCH</h1>
      </div>

      <p className="max-w-md text-sm text-[#9ba3b4]">
        Етап 1 завершено: monorepo, Docker, PostgreSQL, Redis і NestJS API
        піднято та з&apos;єднано з цим Next.js фронтендом.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatusPill
          label="API"
          status={isError ? 'error' : health ? 'ok' : undefined}
          loading={isLoading}
        />
        <StatusPill label="Database" status={health?.db} loading={isLoading} />
        <StatusPill label="Redis" status={health?.redis} loading={isLoading} />
      </div>

      {health && (
        <p className="text-xs text-[#636b7a]">
          API version {health.version} · uptime {health.uptime}s
        </p>
      )}

      {isError && (
        <p className="max-w-sm text-xs text-status-conflict">
          Не вдалось з&apos;єднатись з API. Перевірте, що{' '}
          <code className="rounded bg-bg-3 px-1">docker-compose up</code>{' '}
          запущено і NEXT_PUBLIC_API_URL налаштовано коректно.
        </p>
      )}
    </main>
  );
}
