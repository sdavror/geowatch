import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GeoWatch — Global Intelligence Platform',
  description:
    'Real-time geopolitical intelligence: conflicts, economic instability, and political risk worldwide.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-[#e8eaf0] antialiased">
        {children}
      </body>
    </html>
  );
}
