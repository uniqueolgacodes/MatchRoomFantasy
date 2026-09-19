// Wraps every authenticated route. Providers order matches PRD §26.2:
// Auth -> Room -> Buddy, with the BuddyBall mounted once here so it
// persists across route changes.
import { AuthProvider } from '@/providers/AuthProvider';
import { RoomProvider } from '@/providers/RoomProvider';
import { BuddyProvider } from '@/providers/BuddyProvider';
// import { BuddyBall } from '@/components/buddy/BuddyBall';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RoomProvider>
        <BuddyProvider>
          {children}
          {/* <BuddyBall /> — enable once Buddy AI (PRD §19) is built */}
        </BuddyProvider>
      </RoomProvider>
    </AuthProvider>
  );
}
