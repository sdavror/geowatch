'use client';

import { useTheme } from '@/components/ThemeProvider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-3 hover:text-text-primary"
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.22 2.78a1 1 0 011.41 1.41l-.7.71a1 1 0 11-1.42-1.41l.71-.71zM18 9a1 1 0 110 2h-1a1 1 0 110-2h1zM5.64 4.22a1 1 0 010 1.41l-.71.71A1 1 0 113.5 4.93l.71-.7a1 1 0 011.43 0zM10 6a4 4 0 100 8 4 4 0 000-8zM3 9a1 1 0 110 2H2a1 1 0 110-2h1zm1.93 4.36a1 1 0 011.41 1.41l-.7.71a1 1 0 11-1.42-1.42l.71-.7zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm5.36-1.93a1 1 0 010 1.41l-.71.71a1 1 0 11-1.41-1.41l.7-.71a1 1 0 011.42 0z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  );
}
