// Wraps every route in the main app. AuthProvider now lives at the
// root (app/layout.tsx) since /login and /onboarding need it too —
// this layout only adds the providers/chrome specific to the
// authenticated app shell.
import { RoomProvider } from '@/providers/RoomProvider';
import { BuddyProvider } from '@/providers/BuddyProvider';
import { UserMenu } from '@/components/auth/UserMenu';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { WinPopup } from '@/components/notifications/WinPopup';
import { PushRegistration } from '@/components/notifications/PushRegistration';
import { InstallPromptBanner } from '@/components/pwa/InstallPromptBanner';
// import { BuddyBall } from '@/components/buddy/BuddyBall';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoomProvider>
      <BuddyProvider>
        <WinPopup />
        <InstallPromptBanner />
        <PushRegistration />
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <a href="/" className="font-display text-lg font-bold">
            MatchRoom
          </a>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        {children}
        {/* <BuddyBall /> — enable once Buddy AI (PRD §19) is built */}
      </BuddyProvider>
    </RoomProvider>
  );
}