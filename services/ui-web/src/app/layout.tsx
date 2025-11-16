import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ApiBaseProvider } from '@/utils/apiClient';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI Budget Assistant',
  description: 'Next.js 15 UI for asking clarifications and presenting budget insights.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-slate-950">
      <body className={`${inter.className} min-h-screen bg-slate-950 text-slate-100`}>
        <ApiBaseProvider>{children}</ApiBaseProvider>
      </body>
    </html>
  );
}
