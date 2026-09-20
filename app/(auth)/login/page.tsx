// Unified login page with Google OAuth, Phone OTP, and Email/Password options.
// PRD §9.2 Signup Flow — Google primary for ease, phone OTP for Nigeria market, email fallback.
// Extended sessions: 30 days so users stay logged in.
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
import { Chrome, Mail, Smartphone, Loader2 } from 'lucide-react';

type LoginMethod = 'google' | 'phone' | 'email';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithGoogle, user } = useAuth();
  const supabase = createClient();

  const [method, setMethod] = useState<LoginMethod>('google');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  // Phone OTP state
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  // Email state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  // Redirect if already logged in
  if (user) {
    const redirect = searchParams.get('redirect') ?? '/';
    router.push(redirect);
    return null;
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      console.error('Google sign-in error:', error);
      alert('Failed to sign in with Google. Please try again.');
    }
    setLoading(false);
  }

  async function sendOtp() {
    if (!phone.startsWith('+')) {
      alert('Please include country code (e.g., +234 for Nigeria)');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        channel: 'sms',
      }
    });
    if (error) {
      alert(error.message);
    } else {
      setOtpSent(true);
    }
    setLoading(false);
  }

  async function verifyOtp() {
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: 'sms'
    });
    if (error) {
      alert(error.message);
    } else {
      const redirect = searchParams.get('redirect') ?? '/';
      router.push(redirect);
    }
    setLoading(false);
  }

  async function handleEmailAuth() {
    setLoading(true);
    let error;

    if (isSignUp) {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      error = signUpError;
      if (!error) {
        alert('Check your email for the confirmation link!');
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      error = signInError;
      if (!error) {
        const redirect = searchParams.get('redirect') ?? '/';
        router.push(redirect);
      }
    }

    if (error) {
      alert(error.message);
    }
    setLoading(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12">
      {/* Header */}
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold text-white">
          Welcome to MatchRoom
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Predict EPL matches. Win glory. No cash needed.
        </p>
      </div>

      {/* Error message from URL */}
      {searchParams.get('error') && (
        <div className="mt-4 rounded-lg bg-red-900/50 px-4 py-2 text-sm text-red-200">
          {searchParams.get('error') === 'oauth_failed'
            ? 'Google sign-in failed. Please try again.'
            : 'An error occurred. Please try again.'}
        </div>
      )}

      {/* Method selector tabs */}
      <div className="mt-8 flex w-full gap-2 rounded-lg bg-gray-800 p-1">
        <button
          onClick={() => setMethod('google')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${method === 'google'
              ? 'bg-pitch text-white'
              : 'text-gray-400 hover:text-white'
            }`}
        >
          Google
        </button>
        <button
          onClick={() => setMethod('phone')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${method === 'phone'
              ? 'bg-pitch text-white'
              : 'text-gray-400 hover:text-white'
            }`}
        >
          Phone
        </button>
        <button
          onClick={() => setMethod('email')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${method === 'email'
              ? 'bg-pitch text-white'
              : 'text-gray-400 hover:text-white'
            }`}
        >
          Email
        </button>
      </div>

      {/* Content based on selected method */}
      <div className="mt-8 w-full">
        {/* Google Sign-In */}
        {method === 'google' && (
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 font-semibold text-gray-900 transition-colors hover:bg-gray-100 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Chrome className="h-5 w-5" />
            )}
            {loading ? 'Signing in...' : 'Continue with Google'}
          </button>
        )}

        {/* Phone OTP */}
        {method === 'phone' && !otpSent && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm text-gray-400">
                Phone Number (with country code)
              </label>
              <input
                className="w-full rounded-lg bg-gray-800 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-pitch"
                placeholder="+234..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
              />
            </div>
            <button
              onClick={sendOtp}
              disabled={loading || !phone}
              className="flex items-center justify-center gap-2 rounded-lg bg-pitch px-4 py-3 font-semibold transition-colors hover:bg-pitch/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Smartphone className="h-5 w-5" />}
              Send verification code
            </button>
          </div>
        )}

        {method === 'phone' && otpSent && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm text-gray-400">
                Enter 6-digit code sent to {phone}
              </label>
              <input
                className="w-full rounded-lg bg-gray-800 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-pitch"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                type="text"
                maxLength={6}
              />
            </div>
            <button
              onClick={verifyOtp}
              disabled={loading || code.length !== 6}
              className="rounded-lg bg-pitch px-4 py-3 font-semibold transition-colors hover:bg-pitch/90 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Continue'}
            </button>
            <button
              onClick={() => {
                setOtpSent(false);
                setCode('');
              }}
              className="text-sm text-gray-400 hover:text-white"
            >
              Wrong number? Go back
            </button>
          </div>
        )}

        {/* Email/Password */}
        {method === 'email' && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm text-gray-400">
                Email Address
              </label>
              <input
                className="w-full rounded-lg bg-gray-800 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-pitch"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-400">
                Password
              </label>
              <input
                className="w-full rounded-lg bg-gray-800 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-pitch"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
              />
            </div>
            <button
              onClick={handleEmailAuth}
              disabled={loading || !email || !password}
              className="flex items-center justify-center gap-2 rounded-lg bg-pitch px-4 py-3 font-semibold transition-colors hover:bg-pitch/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
              {isSignUp ? 'Create Account' : 'Sign In'}
            </button>

            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-gray-400 hover:text-white"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        )}
      </div>

      {/* Footer note about session length */}
      <p className="mt-8 text-xs text-gray-500">
        🔒 Stay logged in for 30 days — no need to keep signing in!
      </p>
    </main>
  );
}