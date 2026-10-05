import type { Metadata, Viewport } from 'next';
import { Inter, Bricolage_Grotesque } from 'next/font/google';
import { AuthProvider } from '@/providers/AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });

export const metadata: Metadata = {
  title: 'MatchRoom Fantasy',
  description: 'Free matchday prediction rooms for EPL fans — no cash, just banter and bragging rights.',
  manifest: '/manifest.json',
  // iOS has no manifest-driven install prompt and ignores several
  // manifest fields Android honors — these meta tags are what
  // actually controls "looks like a real app, not a Safari tab" once
  // someone does Add to Home Screen there.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MatchRoom',
  },
};

// Next 14 split themeColor out of the `metadata` export into its own
// `viewport` export — keeping it on `metadata` still "works" but logs
// a build-time deprecation warning.
export const viewport: Viewport = {
  themeColor: '#16a34a',
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

          ToastProvider is here for the same reason — /login needs it
          to replace its browser alert() calls, and any future page
          outside (main) will too.
        */}
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
