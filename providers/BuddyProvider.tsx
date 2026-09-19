'use client';
// Placeholder for Buddy AI state (PRD §19). Fill in with the state
// machine (idle/talking/notifying/...) once Buddy is built.
import { createContext, useContext } from 'react';

const BuddyContext = createContext<Record<string, never>>({});

export function BuddyProvider({ children }: { children: React.ReactNode }) {
  return <BuddyContext.Provider value={{}}>{children}</BuddyContext.Provider>;
}

export const useBuddyContext = () => useContext(BuddyContext);
