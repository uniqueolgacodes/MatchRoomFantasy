'use client';
// Minimal identity + sign-out control for the main app header.
import { useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { LogOut, User as UserIcon } from 'lucide-react';

export function UserMenu() {
  const { user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) {
    return (
      <a href="/login" className="rounded-lg bg-pitch px-3 py-1.5 text-sm font-semibold">
        Log in
      </a>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5"
      >
        <UserIcon className="h-4 w-4" />
        {profile?.username ?? 'Account'}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 rounded-lg border border-white/10 bg-ink-soft p-1 shadow-lg">
          <a href="/profile" className="block rounded-md px-3 py-2 text-sm hover:bg-white/5">
            Profile
          </a>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
