/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#0a0c10', 2: '#111418', 3: '#1a1e26', 4: '#222732' },
        status: {
          conflict: '#e84545',
          crisis: '#f28c2a',
          unstable: '#f5c542',
          stable: '#3ecf8e',
        },
        accent: { blue: '#4a9eff', purple: '#a78bfa' },
      },
    },
  },
  plugins: [],
};
