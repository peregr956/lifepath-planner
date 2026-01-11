'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import type { Route } from 'next';
import { ChevronDown, LogOut, Settings, User } from 'lucide-react';
import { Button } from '@/components/ui';

interface UserMenuProps {
  className?: string;
}

export function UserMenu({ className }: UserMenuProps) {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  // Loading state
  if (status === 'loading') {
    return (
      <div className={`h-8 w-8 animate-pulse rounded-full bg-muted ${className}`} />
    );
  }

  // Not signed in
  if (!session?.user) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Button variant="ghost" size="sm" asChild>
          <Link href={'/login' as Route}>Sign in</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href={'/signup' as Route}>Sign up</Link>
        </Button>
      </div>
    );
  }

  const user = session.user;
  const initials = getInitials(user.name || user.email);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  return (
    <div className={`relative ${className}`}>
      {/* User button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
      >
        {/* Avatar */}
        {user.image ? (
          <Image
            src={user.image}
            alt={user.name || 'User avatar'}
            width={32}
            height={32}
            className="h-8 w-8 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
            {initials}
          </div>
        )}
        
        {/* Name (hidden on mobile) */}
        <span className="hidden max-w-[120px] truncate text-sm font-medium text-foreground md:block">
          {user.name || user.email}
        </span>
        
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-card py-1 shadow-lg">
            {/* User info */}
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-sm font-medium text-foreground">
                {user.name || 'User'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>

            {/* Menu items */}
            <div className="py-1">
              <Link
                href={'/settings/profile' as Route}
                className="flex items-center gap-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                onClick={() => setIsOpen(false)}
              >
                <User className="h-4 w-4 text-muted-foreground" />
                Profile
              </Link>
              <Link
                href={'/settings' as Route}
                className="flex items-center gap-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                onClick={() => setIsOpen(false)}
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
                Settings
              </Link>
            </div>

            {/* Sign out */}
            <div className="border-t border-border py-1">
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive transition-colors hover:bg-muted"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function getInitials(name: string): string {
  if (!name) return '?';
  
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
