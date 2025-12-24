import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AppProviders } from './providers';
import { TooltipProvider } from '@/components/ui';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'LifePath Planner - AI-Powered Financial Guidance',
  description:
    'Upload your budget, get personalized financial insights and actionable suggestions powered by AI.',
  keywords: ['budget', 'financial planning', 'AI', 'money management', 'savings'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <AppProviders>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </AppProviders>
      </body>
    </html>
  );
}
