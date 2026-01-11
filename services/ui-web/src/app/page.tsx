import Link from 'next/link';
import type { Route } from 'next';
import {
  ArrowRight,
  BarChart3,
  Brain,
  FileSpreadsheet,
  MessageSquareText,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { auth } from '@/lib/auth';

export default async function LandingPage() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <div className="min-h-screen bg-background">
      {/* Header with auth */}
      <header className="absolute left-0 right-0 top-0 z-20">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground">LifePath Planner</span>
          </Link>

          <nav className="flex items-center gap-3">
            {isLoggedIn ? (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/upload">Dashboard</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/upload">
                    Get Started
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href={'/login' as Route}>Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={'/signup' as Route}>Sign up</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />

        {/* Animated grid pattern */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px),
                             linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />

        <div className="container relative mx-auto px-4 pt-32 pb-24 lg:pt-40 lg:pb-32">
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary animate-fade-in">
              <Sparkles className="h-4 w-4" />
              <span>AI-Powered Financial Guidance</span>
            </div>

            {/* Headline */}
            <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl animate-fade-in-up">
              Take Control of Your{' '}
              <span className="bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
                Financial Future
              </span>
            </h1>

            {/* Subheadline */}
            <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl animate-fade-in-up stagger-1">
              Upload your budget in any format. Get personalized, AI-powered insights and
              actionable suggestions to optimize your spending and reach your goals faster.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row animate-fade-in-up stagger-2">
              <Button asChild size="xl">
                <Link href="/upload">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="#how-it-works">See How It Works</Link>
              </Button>
            </div>

            {/* Trust indicators */}
            <p className="mt-8 text-sm text-muted-foreground animate-fade-in stagger-3">
              No credit card required. Your data stays private.
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t border-border bg-card/50 py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Everything You Need for Smarter Budgeting
            </h2>
            <p className="mb-16 text-lg text-muted-foreground">
              Powerful tools that work with the budget format you already use.
            </p>
          </div>

          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
            {/* Feature 1 */}
            <div className="group rounded-2xl border border-border bg-card p-8 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
              <div className="mb-4 inline-flex rounded-xl bg-primary/10 p-3">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-foreground">Smart Budget Analysis</h3>
              <p className="text-muted-foreground">
                We understand your budget file regardless of format—CSV, Excel, or other
                spreadsheets. No manual categorization needed.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group rounded-2xl border border-border bg-card p-8 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
              <div className="mb-4 inline-flex rounded-xl bg-success/10 p-3">
                <Brain className="h-6 w-6 text-success" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-foreground">AI-Powered Suggestions</h3>
              <p className="text-muted-foreground">
                Get personalized recommendations tailored to your unique financial situation, goals,
                and spending patterns.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group rounded-2xl border border-border bg-card p-8 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
              <div className="mb-4 inline-flex rounded-xl bg-warning/10 p-3">
                <Target className="h-6 w-6 text-warning" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-foreground">
                Goal-Oriented Planning
              </h3>
              <p className="text-muted-foreground">
                Whether it&apos;s paying off debt, building savings, or reaching financial freedom,
                we help you create a clear path forward.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="border-t border-border py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Three Simple Steps to Financial Clarity
            </h2>
            <p className="mb-16 text-lg text-muted-foreground">
              Get started in minutes, not hours. No complex setup required.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-3">
            {/* Step 1 */}
            <div className="relative">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                  1
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Upload className="h-5 w-5 text-primary" />
                    <h3 className="text-xl font-semibold text-foreground">Upload Your Budget</h3>
                  </div>
                  <p className="text-muted-foreground">
                    Drop in the spreadsheet you already use. We support CSV, Excel, and more—no
                    reformatting needed.
                  </p>
                </div>
              </div>
              {/* Connector line */}
              <div className="absolute left-6 top-14 hidden h-16 w-px bg-border lg:block" />
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                  2
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <MessageSquareText className="h-5 w-5 text-primary" />
                    <h3 className="text-xl font-semibold text-foreground">Answer a Few Questions</h3>
                  </div>
                  <p className="text-muted-foreground">
                    We&apos;ll ask smart follow-up questions to understand your goals, priorities,
                    and financial context.
                  </p>
                </div>
              </div>
              {/* Connector line */}
              <div className="absolute left-6 top-14 hidden h-16 w-px bg-border lg:block" />
            </div>

            {/* Step 3 */}
            <div className="relative">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success text-lg font-bold text-success-foreground">
                  3
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-success" />
                    <h3 className="text-xl font-semibold text-foreground">Get Your Results</h3>
                  </div>
                  <p className="text-muted-foreground">
                    Receive a clear summary of your finances with personalized, actionable
                    suggestions to improve.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <Button asChild size="xl">
              <Link href="/upload">
                Start Your Analysis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Social Proof / Trust Section */}
      <section className="border-t border-border bg-card/50 py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mb-2 text-3xl font-bold text-foreground">100%</div>
              <div className="text-sm text-muted-foreground">Private & Secure</div>
            </div>
            <div className="text-center">
              <div className="mb-2 text-3xl font-bold text-foreground">Free</div>
              <div className="text-sm text-muted-foreground">No Credit Card Required</div>
            </div>
            <div className="text-center">
              <div className="mb-2 text-3xl font-bold text-foreground">Instant</div>
              <div className="text-sm text-muted-foreground">Results in Minutes</div>
            </div>
          </div>
        </div>
      </section>

      {/* Supported Formats */}
      <section className="border-t border-border py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h3 className="mb-6 text-lg font-semibold text-foreground">Works With Your Format</h3>
            <div className="flex flex-wrap items-center justify-center gap-8">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileSpreadsheet className="h-6 w-6" />
                <span>CSV</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileSpreadsheet className="h-6 w-6" />
                <span>Excel (.xlsx)</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileSpreadsheet className="h-6 w-6" />
                <span>Excel (.xls)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <TrendingUp className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold text-foreground">LifePath Planner</span>
            </div>

            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <Link href="/upload" className="transition-colors hover:text-foreground">
                Get Started
              </Link>
              <Link href="/diagnostics" className="transition-colors hover:text-foreground">
                Diagnostics
              </Link>
            </nav>

            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} LifePath Planner
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
