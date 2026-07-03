'use client';

import type { EventCategory } from '@geowatch/shared-types';

const CATEGORIES: Array<{ label: string; value: EventCategory | null }> = [
  { label: 'World', value: null },
  { label: 'Conflict', value: 'military' },
  { label: 'Economy', value: 'economic' },
  { label: 'Politics', value: 'political' },
];

interface CategoryNavProps {
  active: EventCategory | null;
  onSelect: (category: EventCategory | null) => void;
}

export function CategoryNav({ active, onSelect }: CategoryNavProps) {
  return (
    <nav className="flex gap-4 text-[13px]">
      {CATEGORIES.map((c) => (
        <button
          key={c.label}
          onClick={() => onSelect(c.value)}
          className={
            active === c.value
              ? 'font-medium text-text-primary'
              : 'text-text-tertiary transition-colors hover:text-text-secondary'
          }
        >
          {c.label}
        </button>
      ))}
    </nav>
  );
}
