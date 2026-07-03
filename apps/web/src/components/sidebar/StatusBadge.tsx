import { STATUS_COLOR, STATUS_LABEL } from '@geowatch/shared-types';
import type { CountryStatus } from '@geowatch/shared-types';

export function StatusBadge({ status }: { status: CountryStatus }) {
  const color = STATUS_COLOR[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {STATUS_LABEL[status]}
    </span>
  );
}
