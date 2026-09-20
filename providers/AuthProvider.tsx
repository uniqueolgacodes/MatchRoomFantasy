'use client';
// Loads the current Supabase session AND the matching profiles row,
// and exposes both via context. PRD §9 Auth Strategy.
// Extended session: 30 days for relaxed, uninterrupted experience.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  favourite_team_id: string | null;
  buddy_enabled: boolean;
  onboarding_completed_at: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<{ error: unknown }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signInWithGoogle: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadProfile = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, favourite_team_id, buddy_enabled, onboarding_completed_at')
        .eq('id', userId)
        .maybeSingle();
      setProfile(data);
    },
    [supabase]
  );

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) await loadProfile(session.user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase, loadProfile]);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    return { error };
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    window.location.href = '/login';
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signInWithGoogle, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
