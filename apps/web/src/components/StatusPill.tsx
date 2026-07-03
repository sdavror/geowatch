'use client';

interface StatusPillProps {
  label: string;
  status: 'ok' | 'error' | undefined;
  loading: boolean;
}

export function StatusPill({ label, status, loading }: StatusPillProps) {
  const color = loading
    ? 'bg-gray-500'
    : status === 'ok'
      ? 'bg-status-stable'
      : 'bg-status-conflict';

  const text = loading ? 'checking…' : status === 'ok' ? 'online' : 'offline';

  return (
    <div className="flex items-center gap-2 rounded-md border border-white/10 bg-bg-3 px-3 py-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-[#9ba3b4]">{label}</span>
      <span className="font-medium">{text}</span>
    </div>
  );
}
