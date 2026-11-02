import type { Metadata } from 'next';
import './globals.css';
import SprintNavigation from '../components/SprintNavigation';

export const metadata: Metadata = {
  title: 'Khmer-English Speech Dataset Progress Dashboard',
  description: 'Sprint 1 foundation for the Khmer-English speech dataset dashboard.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 min-h-screen text-slate-900 antialiased">
          <SprintNavigation />
          <main className="foundation-main">
            {children}
          </main>
      </body>
    </html>
  );
}
