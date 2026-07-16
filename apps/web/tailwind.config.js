/** @type {import('tailwindcss').Config} */

// Helper for CSS-variable-backed colors with alpha-channel support
// (e.g. `bg-text-primary/50`). Tailwind calls this with the requested
// opacity value, which we forward into rgb()'s alpha slot.
function withOpacity(variableName) {
  return ({ opacityValue }) =>
    opacityValue === undefined
      ? `rgb(var(${variableName}))`
      : `rgb(var(${variableName}) / ${opacityValue})`;
}

const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class', // toggled via a `dark`/`light` class on <html>, see ThemeProvider
  theme: {
    extend: {
      fontFamily: {
        // Wired to next/font CSS variables set on <html> in layout.tsx.
        sans: ['var(--font-inter)', ...defaultTheme.fontFamily.sans],
        serif: ['var(--font-lora)', 'Georgia', ...defaultTheme.fontFamily.serif],
      },
      // Type scale from the admin design sheet (Inter):
      // Display 32/40 Bold · H1 24/32 SemiBold · H2 20/28 SemiBold ·
      // H3 18/24 Medium · Body1 16/24 · Body2 14/20 · Caption 12/16.
      fontSize: {
        display: ['32px', { lineHeight: '40px', fontWeight: '700' }],
        h1: ['24px', { lineHeight: '32px', fontWeight: '600' }],
        h2: ['20px', { lineHeight: '28px', fontWeight: '600' }],
        h3: ['18px', { lineHeight: '24px', fontWeight: '500' }],
        body1: ['16px', { lineHeight: '24px', fontWeight: '400' }],
        body2: ['14px', { lineHeight: '20px', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '16px', fontWeight: '400' }],
      },
      colors: {
        bg: {
          DEFAULT: withOpacity('--color-bg'),
          2: withOpacity('--color-bg-2'),
          3: withOpacity('--color-bg-3'),
          4: withOpacity('--color-bg-4'),
        },
        text: {
          primary: withOpacity('--color-text-primary'),
          secondary: withOpacity('--color-text-secondary'),
          tertiary: withOpacity('--color-text-tertiary'),
        },
        // Status colors are intentionally plain hex, NOT theme variables —
        // these are semaphore signals (conflict/crisis/etc.) that must mean
        // the same thing in light and dark mode, unlike brand decoration.
        status: {
          conflict: '#e84545',
          crisis: '#f28c2a',
          unstable: '#f5c542',
          stable: '#3ecf8e',
        },
        // Brand color (lavender) DOES adapt between themes — see globals.css
        brand: {
          DEFAULT: withOpacity('--color-brand'),
          text: withOpacity('--color-brand-text'),
          bg: withOpacity('--color-brand-bg'),
        },
        accent: { blue: '#4a9eff', purple: '#a78bfa' },
      },
      borderColor: {
        border: withOpacity('--color-border'),
      },
    },
  },
  plugins: [],
};
