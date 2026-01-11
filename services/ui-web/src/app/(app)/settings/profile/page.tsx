'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2, Save, User } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { Button, Label } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface UserProfile {
  default_financial_philosophy: string | null;
  default_optimization_focus: string | null;
  default_risk_tolerance: string | null;
  onboarding_completed: boolean;
}

export default function ProfileSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [profile, setProfile] = useState<UserProfile>({
    default_financial_philosophy: null,
    default_optimization_focus: null,
    default_risk_tolerance: null,
    onboarding_completed: false,
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login' as Route);
    }
  }, [status, router]);

  // Fetch profile on mount
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/user/profile');
        if (res.ok) {
          const data = await res.json();
          setProfile(data.profile);
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      } finally {
        setIsLoading(false);
      }
    }

    if (session?.user) {
      fetchProfile();
    }
  }, [session]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.details || 'Failed to save profile');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      {/* Header */}
      <div className="space-y-4">
        <Link
          href={'/settings' as Route}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Profile Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage your default preferences for budget analysis
            </p>
          </div>
        </div>
      </div>

      {/* Profile form */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="space-y-6">
          {/* Account info (read-only) */}
          <div className="space-y-4 border-b border-border pb-6">
            <h2 className="text-lg font-semibold text-foreground">Account Information</h2>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-muted-foreground">Name</Label>
                <p className="mt-1 font-medium text-foreground">
                  {session?.user?.name || 'Not set'}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="mt-1 font-medium text-foreground">
                  {session?.user?.email}
                </p>
              </div>
            </div>
          </div>

          {/* Default preferences */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Default Preferences</h2>
            <p className="text-sm text-muted-foreground">
              These preferences will be used as defaults when you create new budget analyses.
            </p>

            {/* Financial Philosophy */}
            <div className="space-y-2">
              <Label htmlFor="philosophy">Financial Philosophy</Label>
              <Select
                value={profile.default_financial_philosophy || 'none'}
                onValueChange={(value) =>
                  setProfile({ ...profile, default_financial_philosophy: value === 'none' ? null : value })
                }
              >
                <SelectTrigger id="philosophy">
                  <SelectValue placeholder="Choose a philosophy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preference</SelectItem>
                  <SelectItem value="rpf">r/personalfinance (Reddit)</SelectItem>
                  <SelectItem value="money_guy">Money Guy Show</SelectItem>
                  <SelectItem value="dave_ramsey">Dave Ramsey</SelectItem>
                  <SelectItem value="bogleheads">Bogleheads</SelectItem>
                  <SelectItem value="fire">FIRE Movement</SelectItem>
                  <SelectItem value="neutral">Neutral / Balanced</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This affects the style and priorities of suggestions
              </p>
            </div>

            {/* Optimization Focus */}
            <div className="space-y-2">
              <Label htmlFor="optimization">Optimization Focus</Label>
              <Select
                value={profile.default_optimization_focus || 'none'}
                onValueChange={(value) =>
                  setProfile({ ...profile, default_optimization_focus: value === 'none' ? null : value })
                }
              >
                <SelectTrigger id="optimization">
                  <SelectValue placeholder="Choose a focus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preference</SelectItem>
                  <SelectItem value="debt_payoff">Debt Payoff</SelectItem>
                  <SelectItem value="savings">Savings & Investment</SelectItem>
                  <SelectItem value="balanced">Balanced Approach</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                What should we prioritize in recommendations?
              </p>
            </div>

            {/* Risk Tolerance */}
            <div className="space-y-2">
              <Label htmlFor="risk">Risk Tolerance</Label>
              <Select
                value={profile.default_risk_tolerance || 'none'}
                onValueChange={(value) =>
                  setProfile({ ...profile, default_risk_tolerance: value === 'none' ? null : value })
                }
              >
                <SelectTrigger id="risk">
                  <SelectValue placeholder="Choose risk tolerance" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preference</SelectItem>
                  <SelectItem value="conservative">Conservative</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="aggressive">Aggressive</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Your comfort level with financial risk
              </p>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Save button */}
          <div className="flex items-center gap-3 pt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
