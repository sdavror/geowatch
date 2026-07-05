import type { Metadata } from 'next';
import { Inter, Lora } from 'next/font/google';
import './globals.css';
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/components/ThemeProvider';
import { AuthProvider } from '@/lib/auth';

// Fonts are downloaded at build time and self-hosted — no runtime requests
// to Google. Inter: tall x-height, stays legible at the small sizes a dense
// dashboard needs. Lora: serif for long-form article reading. Both include
// Cyrillic for Ukrainian content.
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});
const lora = Lora({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-lora',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GeoWatch — Global Intelligence Platform',
  description:
    'Real-time geopolitical intelligence: conflicts, economic instability, and political risk worldwide.',
  openGraph: {
    title: 'GeoWatch — Global Intelligence Platform',
    description:
      'Real-time geopolitical intelligence: conflicts, economic instability, and political risk worldwide.',
    type: 'website',
    siteName: 'GeoWatch',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GeoWatch — Global Intelligence Platform',
    description:
      'Real-time geopolitical intelligence: conflicts, economic instability, and political risk worldwide.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${lora.variable}`}>
      <head>
        {/* Runs before first paint to apply the saved/system theme class —
            this is what actually prevents a flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg font-sans text-text-primary antialiased">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
