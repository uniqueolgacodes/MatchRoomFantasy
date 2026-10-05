'use client';
import { useAuth } from '@/providers/AuthProvider';

export function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <button onClick={signOut} className="text-sm font-medium text-red-400 transition-colors hover:text-red-300">
      Sign out
    </button>
  );
}
