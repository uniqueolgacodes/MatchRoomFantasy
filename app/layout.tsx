import type { Metadata } from 'next';
import { Inter, Bricolage_Grotesque } from 'next/font/google';
import { AuthProvider } from '@/providers/AuthProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });

export const metadata: Metadata = {
  title: 'MatchRoom Fantasy',
  description: 'Free matchday prediction rooms for EPL fans — no cash, just banter and bragging rights.',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable}`}>
      <body className="bg-ink text-white font-body antialiased">
        {/*
          AuthProvider lives at the root, not in (main)/layout.tsx.
          /login and /onboarding are outside the (main) route group
          and both call useAuth() — without this at the root, those
          pages silently got the context's default stub values
          instead of a real session (Google sign-in looked like it
          worked but never actually called Supabase).
        */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
