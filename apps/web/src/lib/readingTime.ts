// Estimated reading time at an average adult pace (~200 wpm). Falls back to
// a 1-minute floor so even a short brief shows a sensible label.
export function readingTimeMinutes(...parts: (string | null | undefined)[]): number {
  const words = parts
    .filter(Boolean)
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
