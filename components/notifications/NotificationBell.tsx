'use client';
// In-app notification center. Phase A put every notification into one
// table but nothing displayed them except the win popup, so anything
// new (kickoff reminders, room activity) was invisible to anyone who
// hadn't enabled push. This is the persistent list: a bell with an
// unread count, a dropdown of recent notifications, tap to jump to
// the relevant page.
//
// One Realtime subscription on all events for the person's own rows:
// INSERTs add to the top, UPDATEs replace in place (that covers
// read_at changes and the "3 new members joined" collapsing the join
// trigger does).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
import { timeAgo } from '@/lib/utils/format';

interface NotificationItem {
    id: string;
    type: string;
    title: string;
    body: string;
    deep_link: string | null;
    read_at: string | null;
    created_at: string;
}

const TYPE_EMOJI: Record<string, string> = {
    win: '🏆',
    reminder: '⏰',
    room_activity: '👥',
    system: '📣',
};

const MAX_ITEMS = 30;

export function NotificationBell() {
    const { user } = useAuth();
    const router = useRouter();
    const [items, setItems] = useState<NotificationItem[]>([]);
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const unreadCount = items.filter((i) => !i.read_at).length;

    useEffect(() => {
        if (!user) return;
        const supabase = createClient();

        supabase
            .from('notifications')
            .select('id, type, title, body, deep_link, read_at, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(MAX_ITEMS)
            .then(({ data }) => setItems(data ?? []));

        const channel = supabase
            .channel(`notification-bell:${user.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
                (payload) => {
                    if (payload.eventType === 'DELETE') return;
                    const row = payload.new as NotificationItem;
                    setItems((prev) =>
                        [row, ...prev.filter((i) => i.id !== row.id)]
                            .sort((a, b) => b.created_at.localeCompare(a.created_at))
                            .slice(0, MAX_ITEMS)
                    );
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    useEffect(() => {
        if (!open) return;
        function onPointerDown(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [open]);

    async function markRead(ids: string[]) {
        if (ids.length === 0) return;
        const now = new Date().toISOString();
        setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, read_at: i.read_at ?? now } : i)));
        const supabase = createClient();
        await supabase.from('notifications').update({ read_at: now }).in('id', ids);
    }

    function openItem(item: NotificationItem) {
        if (!item.read_at) markRead([item.id]);
        setOpen(false);
        if (item.deep_link) router.push(item.deep_link);
    }

    if (!user) return null;

    return (
        <div ref={containerRef} className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                className="relative rounded-lg p-2 text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-pitch px-1 text-[10px] font-bold leading-none text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-white/10 bg-ink-soft shadow-2xl shadow-black/50">
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                        <span className="text-sm font-semibold">Notifications</span>
                        {unreadCount > 0 && (
                            <button
                                onClick={() => markRead(items.filter((i) => !i.read_at).map((i) => i.id))}
                                className="text-xs font-medium text-pitch-light transition-colors hover:text-white"
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    {items.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-white/40">Nothing yet. Wins and match reminders will show up here.</p>
                    ) : (
                        <div className="max-h-96 overflow-y-auto">
                            {items.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => openItem(item)}
                                    className={`flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-white/[0.05] ${item.read_at ? '' : 'bg-pitch/[0.06]'
                                        }`}
                                >
                                    <span className="mt-0.5 text-lg leading-none">{TYPE_EMOJI[item.type] ?? '🔔'}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold">{item.title}</span>
                                        <span className="mt-0.5 block text-xs leading-relaxed text-white/60">{item.body}</span>
                                        <span className="mt-1 block text-[11px] text-white/30">{timeAgo(item.created_at)}</span>
                                    </span>
                                    {!item.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-pitch" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}