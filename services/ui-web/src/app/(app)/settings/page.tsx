'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronRight, Settings, User } from 'lucide-react';

export default function SettingsPage() {
  const { data: session } = useSession();

  const settingsLinks = [
    {
      href: '/settings/profile',
      icon: User,
      title: 'Profile',
      description: 'Manage your personal information and preferences',
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account and preferences
          </p>
        </div>
      </div>

      {/* User info */}
      {session?.user && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-4">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || 'User'}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-medium text-primary-foreground">
                {(session.user.name || session.user.email)?.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-medium text-foreground">
                {session.user.name || 'User'}
              </p>
              <p className="text-sm text-muted-foreground">
                {session.user.email}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Settings links */}
      <div className="space-y-2">
        {settingsLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href as Route}
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <link.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">{link.title}</p>
                <p className="text-sm text-muted-foreground">{link.description}</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
