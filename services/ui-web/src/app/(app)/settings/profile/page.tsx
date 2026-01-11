'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2, Save, User, HelpCircle, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { 
  Button, 
  Label, 
  Progress,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Badge,
  Input,
} from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FINANCIAL_PHILOSOPHY_OPTIONS,
  RISK_TOLERANCE_OPTIONS,
  GOAL_TIMELINE_OPTIONS,
  LIFE_STAGE_OPTIONS,
  EMERGENCY_FUND_OPTIONS,
  OPTIMIZATION_FOCUS_OPTIONS,
  COMMON_GOALS,
  WHY_WE_ASK,
} from '@/lib/foundationalQuestions';
import type { ProfileMetadata, FieldMetadata, ContextSource } from '@/lib/db';

interface UserProfile {
  default_financial_philosophy: string | null;
  default_optimization_focus: string | null;
  default_risk_tolerance: string | null;
  onboarding_completed: boolean;
  // Phase 9.1.1: Extended foundational fields
  default_primary_goal: string | null;
  default_goal_timeline: string | null;
  default_life_stage: string | null;
  default_emergency_fund_status: string | null;
  // Phase 9.1.1: Confidence metadata
  profile_metadata: ProfileMetadata | null;
}

// Default empty profile
const EMPTY_PROFILE: UserProfile = {
  default_financial_philosophy: null,
  default_optimization_focus: null,
  default_risk_tolerance: null,
  onboarding_completed: false,
  default_primary_goal: null,
  default_goal_timeline: null,
  default_life_stage: null,
  default_emergency_fund_status: null,
  profile_metadata: null,
};

// Fields that count toward profile completeness
const PROFILE_FIELDS = [
  'default_financial_philosophy',
  'default_optimization_focus',
  'default_risk_tolerance',
  'default_primary_goal',
  'default_goal_timeline',
  'default_life_stage',
  'default_emergency_fund_status',
] as const;

function calculateCompleteness(profile: UserProfile): number {
  const filledFields = PROFILE_FIELDS.filter(
    field => profile[field] !== null && profile[field] !== ''
  ).length;
  return Math.round((filledFields / PROFILE_FIELDS.length) * 100);
}

function formatLastConfirmed(isoDate: string | undefined): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return date.toLocaleDateString();
}

function getSourceLabel(source: ContextSource | undefined): string {
  switch (source) {
    case 'explicit': return 'Set in profile';
    case 'onboarding': return 'From onboarding';
    case 'session_promoted': return 'Saved from session';
    case 'inferred': return 'Inferred';
    default: return '';
  }
}

export default function ProfileSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  
  // Custom goal state
  const [showCustomGoal, setShowCustomGoal] = useState(false);
  const [customGoal, setCustomGoal] = useState('');

  // Calculate profile completeness
  const completeness = useMemo(() => calculateCompleteness(profile), [profile]);

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
          setProfile(data.profile || EMPTY_PROFILE);
          
          // Check if primary goal is custom (not in COMMON_GOALS)
          if (data.profile?.default_primary_goal && 
              !COMMON_GOALS.includes(data.profile.default_primary_goal)) {
            setShowCustomGoal(true);
            setCustomGoal(data.profile.default_primary_goal);
          }
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
      // Prepare profile data with custom goal if needed
      const profileToSave = {
        ...profile,
        default_primary_goal: showCustomGoal ? customGoal : profile.default_primary_goal,
      };

      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileToSave),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.details || 'Failed to save profile');
      }

      // Refresh profile to get updated metadata
      const refreshRes = await fetch('/api/user/profile');
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setProfile(data.profile || EMPTY_PROFILE);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoalChange = (value: string) => {
    if (value === '__custom__') {
      setShowCustomGoal(true);
      setProfile({ ...profile, default_primary_goal: null });
    } else {
      setShowCustomGoal(false);
      setCustomGoal('');
      setProfile({ ...profile, default_primary_goal: value });
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
    <TooltipProvider>
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

            {/* Profile Completeness Indicator */}
            <div className="space-y-2 rounded-lg bg-muted/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Profile Completeness</span>
                <span className="text-sm font-semibold text-primary">{completeness}%</span>
              </div>
              <Progress value={completeness} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {completeness === 100 
                  ? 'Your profile is complete! Your preferences will be used to personalize recommendations.'
                  : 'Complete your profile to get more personalized financial recommendations.'}
              </p>
            </div>

            {/* Goals & Planning Section */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Goals & Planning</h2>

              {/* Primary Goal */}
              <ProfileField
                id="primary_goal"
                label="Primary Financial Goal"
                whyWeAsk={WHY_WE_ASK.primaryGoal}
                metadata={profile.profile_metadata?.primary_goal}
              >
                <div className="space-y-2">
                  <Select
                    value={showCustomGoal ? '__custom__' : (profile.default_primary_goal || 'none')}
                    onValueChange={handleGoalChange}
                  >
                    <SelectTrigger id="primary_goal">
                      <SelectValue placeholder="Choose a goal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No preference</SelectItem>
                      {COMMON_GOALS.map(goal => (
                        <SelectItem key={goal} value={goal}>{goal}</SelectItem>
                      ))}
                      <SelectItem value="__custom__">Other (specify)</SelectItem>
                    </SelectContent>
                  </Select>
                  {showCustomGoal && (
                    <Input
                      placeholder="Describe your goal..."
                      value={customGoal}
                      onChange={e => setCustomGoal(e.target.value)}
                      className="animate-fade-in"
                    />
                  )}
                </div>
              </ProfileField>

              {/* Goal Timeline */}
              <ProfileField
                id="goal_timeline"
                label="Goal Timeline"
                whyWeAsk={WHY_WE_ASK.goalTimeline}
                metadata={profile.profile_metadata?.goal_timeline}
              >
                <Select
                  value={profile.default_goal_timeline || 'none'}
                  onValueChange={(value) =>
                    setProfile({ ...profile, default_goal_timeline: value === 'none' ? null : value })
                  }
                >
                  <SelectTrigger id="goal_timeline">
                    <SelectValue placeholder="Choose timeline" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No preference</SelectItem>
                    {GOAL_TIMELINE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div>
                          <div>{opt.label}</div>
                          {opt.description && (
                            <div className="text-xs text-muted-foreground">{opt.description}</div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ProfileField>

              {/* Optimization Focus */}
              <ProfileField
                id="optimization"
                label="Optimization Focus"
                whyWeAsk={WHY_WE_ASK.optimizationFocus}
                metadata={profile.profile_metadata?.optimization_focus}
              >
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
                    {OPTIMIZATION_FOCUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div>
                          <div>{opt.label}</div>
                          {opt.description && (
                            <div className="text-xs text-muted-foreground">{opt.description}</div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ProfileField>
            </div>

            {/* Financial Style Section */}
            <div className="space-y-4 border-t border-border pt-6">
              <h2 className="text-lg font-semibold text-foreground">Financial Style</h2>

              {/* Financial Philosophy */}
              <ProfileField
                id="philosophy"
                label="Financial Philosophy"
                whyWeAsk={WHY_WE_ASK.financialPhilosophy}
                metadata={profile.profile_metadata?.financial_philosophy}
              >
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
                    {FINANCIAL_PHILOSOPHY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div>
                          <div>{opt.label}</div>
                          {opt.description && (
                            <div className="text-xs text-muted-foreground">{opt.description}</div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ProfileField>

              {/* Risk Tolerance */}
              <ProfileField
                id="risk"
                label="Risk Tolerance"
                whyWeAsk={WHY_WE_ASK.riskTolerance}
                metadata={profile.profile_metadata?.risk_tolerance}
              >
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
                    {RISK_TOLERANCE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div>
                          <div>{opt.label}</div>
                          {opt.description && (
                            <div className="text-xs text-muted-foreground">{opt.description}</div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ProfileField>
            </div>

            {/* Life Situation Section */}
            <div className="space-y-4 border-t border-border pt-6">
              <h2 className="text-lg font-semibold text-foreground">Life Situation</h2>

              {/* Life Stage */}
              <ProfileField
                id="life_stage"
                label="Life Stage"
                whyWeAsk={WHY_WE_ASK.lifeStage}
                metadata={profile.profile_metadata?.life_stage}
              >
                <Select
                  value={profile.default_life_stage || 'none'}
                  onValueChange={(value) =>
                    setProfile({ ...profile, default_life_stage: value === 'none' ? null : value })
                  }
                >
                  <SelectTrigger id="life_stage">
                    <SelectValue placeholder="Choose life stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No preference</SelectItem>
                    {LIFE_STAGE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div>
                          <div>{opt.label}</div>
                          {opt.description && (
                            <div className="text-xs text-muted-foreground">{opt.description}</div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ProfileField>

              {/* Emergency Fund Status */}
              <ProfileField
                id="emergency_fund"
                label="Emergency Fund Status"
                whyWeAsk={WHY_WE_ASK.hasEmergencyFund}
                metadata={profile.profile_metadata?.emergency_fund_status}
              >
                <Select
                  value={profile.default_emergency_fund_status || 'none'}
                  onValueChange={(value) =>
                    setProfile({ ...profile, default_emergency_fund_status: value === 'none' ? null : value })
                  }
                >
                  <SelectTrigger id="emergency_fund">
                    <SelectValue placeholder="Choose status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No preference</SelectItem>
                    {EMERGENCY_FUND_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div>
                          <div>{opt.label}</div>
                          {opt.description && (
                            <div className="text-xs text-muted-foreground">{opt.description}</div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ProfileField>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Save button */}
            <div className="flex items-center gap-3 pt-4 border-t">
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
              <p className="text-xs text-muted-foreground">
                These preferences will be used as defaults for new budget analyses.
              </p>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// =============================================================================
// ProfileField Component
// =============================================================================

type ProfileFieldProps = {
  id: string;
  label: string;
  whyWeAsk: string;
  metadata?: FieldMetadata;
  children: React.ReactNode;
};

function ProfileField({ id, label, whyWeAsk, metadata, children }: ProfileFieldProps) {
  const sourceLabel = getSourceLabel(metadata?.source);
  const lastConfirmed = formatLastConfirmed(metadata?.last_confirmed);
  const hasMetadata = sourceLabel || lastConfirmed;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="font-medium mb-1">Why we ask:</p>
            <p>{whyWeAsk}</p>
          </TooltipContent>
        </Tooltip>
        {hasMetadata && (
          <div className="flex items-center gap-1.5 ml-auto">
            {sourceLabel && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {sourceLabel}
              </Badge>
            )}
            {lastConfirmed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-help">
                    <Clock className="h-3 w-3" />
                    {lastConfirmed}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Last confirmed: {metadata?.last_confirmed ? new Date(metadata.last_confirmed).toLocaleString() : 'Unknown'}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
