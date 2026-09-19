// Phone OTP login. PRD §9.2 Signup Flow.
'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const supabase = createClient();

  async function sendOtp() {
    await supabase.auth.signInWithOtp({ phone });
    setOtpSent(true);
  }

  async function verifyOtp() {
    await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    window.location.href = '/';
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-2xl font-bold">Welcome to MatchRoom</h1>
      {!otpSent ? (
        <div className="mt-6 flex flex-col gap-3">
          <input
            className="rounded-lg bg-ink-soft px-4 py-3 outline-none"
            placeholder="+234..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button onClick={sendOtp} className="rounded-lg bg-pitch px-4 py-3 font-semibold">
            Send code
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          <input
            className="rounded-lg bg-ink-soft px-4 py-3 outline-none"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button onClick={verifyOtp} className="rounded-lg bg-pitch px-4 py-3 font-semibold">
            Verify
          </button>
        </div>
      )}
    </main>
  );
}
