import type { Metadata } from 'next';
import './globals.css';
import SprintNavigation from '../components/SprintNavigation';
import ClientProviders from '../components/ClientProviders';

export const metadata: Metadata = {
  title: 'Khmer-English Speech Dataset Progress Dashboard',
  description: 'Sprint 2 foundation and data persistence for the Khmer-English speech dataset dashboard.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 min-h-screen text-slate-900 antialiased">
        <ClientProviders>
          <SprintNavigation />
          <main className="foundation-main">
            {children}
          </main>
        </ClientProviders>
      </body>
    </html>
  );
}
