import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/components/ThemeProvider';

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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint to apply the saved/system theme class —
            this is what actually prevents a flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg text-text-primary antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
