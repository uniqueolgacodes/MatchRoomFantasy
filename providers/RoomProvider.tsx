'use client';
// Placeholder for room-scoped Realtime subscriptions (PRD §24). Fill
// in with the active room's channel, presence, and message stream as
// the Room System (§10) is built.
import { createContext, useContext } from 'react';

const RoomContext = createContext<Record<string, never>>({});

export function RoomProvider({ children }: { children: React.ReactNode }) {
  return <RoomContext.Provider value={{}}>{children}</RoomContext.Provider>;
}

export const useRoomContext = () => useContext(RoomContext);
