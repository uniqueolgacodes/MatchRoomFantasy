'use client';
// Preferences for the notification system. Only things that actually
// do something are listed: kickoff reminders and room activity are
// real triggers (0029), and quiet hours is enforced in the push
// dispatcher (0030). The other notify_* columns (goals, mentions,
// email digest) exist in the schema but nothing sends those yet, so
// they get toggles when the features behind them exist rather than
// switches that change nothing.
//
// Every switch saves immediately and rolls back with a message if the
// write fails. All columns are covered by column-level grants
// (0009, 0029, 0030), so this is plain client-side updates.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { enablePush } from '@/lib/notifications/push';

interface NotificationSettingsProps {
    userId: string;
    hasRegisteredDevice: boolean;
    initial: {
        pushEnabled: boolean;
        kickoff: boolean;
        roomActivity: boolean;
        quietEnabled: boolean;
        quietStart: string; // HH:MM
        quietEnd: string; // HH:MM
        timezone: string;
    };
}

type DeviceStatus = 'checking' | 'unsupported' | 'blocked' | 'allowed' | 'off';

export function NotificationSettings({ userId, hasRegisteredDevice, initial }: NotificationSettingsProps) {
    const supabase = createClient();
    const toast = useToast();

    const [pushEnabled, setPushEnabled] = useState(initial.pushEnabled);
    const [kickoff, setKickoff] = useState(initial.kickoff);
    const [roomActivity, setRoomActivity] = useState(initial.roomActivity);
    const [quietEnabled, setQuietEnabled] = useState(initial.quietEnabled);
    const [quietStart, setQuietStart] = useState(initial.quietStart);
    const [quietEnd, setQuietEnd] = useState(initial.quietEnd);
    const [timezone, setTimezone] = useState(initial.timezone);

    const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>('checking');
    const [registered, setRegistered] = useState(hasRegisteredDevice);
    const [enabling, setEnabling] = useState(false);
    const [deviceTimezone, setDeviceTimezone] = useState<string | null>(null);

    // Browser-only facts, read after mount so server and client render
    // the same markup first.
    useEffect(() => {
        if (typeof Notification === 'undefined') {
            setDeviceStatus('unsupported');
        } else if (Notification.permission === 'denied') {
            setDeviceStatus('blocked');
        } else if (Notification.permission === 'granted') {
            setDeviceStatus('allowed');
        } else {
            setDeviceStatus('off');
        }
        setDeviceTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? null);
    }, []);

    async function save(patch: Record<string, unknown>, revert: () => void) {
        const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
        if (error) {
            revert();
            toast.error('Could not save that. Try again.');
        }
    }

    function toggle(current: boolean, set: (v: boolean) => void, column: string) {
        const next = !current;
        set(next);
        save({ [column]: next }, () => set(current));
    }

    function changeQuietTime(which: 'start' | 'end', value: string) {
        if (!value) return;
        const nextStart = which === 'start' ? value : quietStart;
        const nextEnd = which === 'end' ? value : quietEnd;
        if (nextStart === nextEnd) {
            toast.error('Start and end can not be the same time.');
            return;
        }
        const previous = which === 'start' ? quietStart : quietEnd;
        if (which === 'start') setQuietStart(value);
        else setQuietEnd(value);
        save(
            { [which === 'start' ? 'quiet_hours_start' : 'quiet_hours_end']: value },
            () => (which === 'start' ? setQuietStart(previous) : setQuietEnd(previous))
        );
    }

    function useDeviceTimezone() {
        if (!deviceTimezone) return;
        const previous = timezone;
        setTimezone(deviceTimezone);
        save({ timezone: deviceTimezone }, () => setTimezone(previous));
    }

    async function turnOnForDevice() {
        setEnabling(true);
        const result = await enablePush(userId);
        setEnabling(false);
        if (result === 'enabled') {
            setDeviceStatus('allowed');
            setRegistered(true);
            toast.success('Push notifications are on for this browser.');
        } else if (result === 'denied') {
            setDeviceStatus(typeof Notification !== 'undefined' && Notification.permission === 'denied' ? 'blocked' : 'off');
        } else {
            toast.error('Could not turn on push right now. Try again in a moment.');
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <section className="rounded-xl border border-white/10 bg-ink-soft p-5">
                <h2 className="font-display text-base font-bold">Push notifications</h2>

                <div className="mt-3 text-sm text-white/60">
                    {deviceStatus === 'unsupported' && <p>This browser does not support push notifications.</p>}
                    {deviceStatus === 'blocked' && (
                        <p>Push is blocked for this site in your browser. Allow notifications in the browser&apos;s site settings, then come back here.</p>
                    )}
                    {deviceStatus === 'off' && (
                        <div>
                            <p>Not turned on in this browser yet.</p>
                            <button
                                onClick={turnOnForDevice}
                                disabled={enabling}
                                className="mt-3 rounded-lg bg-pitch px-4 py-2 text-sm font-semibold transition-colors hover:bg-pitch-dark disabled:opacity-50"
                            >
                                {enabling ? 'Turning on...' : 'Turn on for this browser'}
                            </button>
                        </div>
                    )}
                    {deviceStatus === 'allowed' && (
                        <div>
                            <p>Allowed in this browser.</p>
                            {!registered && (
                                <button
                                    onClick={turnOnForDevice}
                                    disabled={enabling}
                                    className="mt-3 rounded-lg bg-pitch px-4 py-2 text-sm font-semibold transition-colors hover:bg-pitch-dark disabled:opacity-50"
                                >
                                    {enabling ? 'Finishing...' : 'Finish setting up this browser'}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="mt-4 border-t border-white/10 pt-4">
                    <SwitchRow
                        label="Send me push notifications"
                        description="Master switch for every device on your account. Wins always show up inside the app; with this on you also get them as a push."
                        checked={pushEnabled}
                        onChange={() => toggle(pushEnabled, setPushEnabled, 'notify_push_enabled')}
                    />
                </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-ink-soft p-5">
                <h2 className="font-display text-base font-bold">What you hear about</h2>
                <p className="mt-1 text-xs text-white/40">
                    Turning one of these off stops it entirely, including in the bell inside the app.
                </p>
                <div className="mt-3 flex flex-col gap-4">
                    <SwitchRow
                        label="Kickoff reminders"
                        description="A heads-up before a match in one of your rooms starts, only if you have not made a pick yet."
                        checked={kickoff}
                        onChange={() => toggle(kickoff, setKickoff, 'notify_kickoff')}
                    />
                    <SwitchRow
                        label="Activity in rooms you own"
                        description="When someone joins your room, or it fills up."
                        checked={roomActivity}
                        onChange={() => toggle(roomActivity, setRoomActivity, 'notify_room_activity')}
                    />
                </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-ink-soft p-5">
                <h2 className="font-display text-base font-bold">Quiet hours</h2>
                <div className="mt-3">
                    <SwitchRow
                        label="Pause push during quiet hours"
                        description="Push notifications are skipped during this window. They still appear in the bell, and are not re-sent when quiet hours end."
                        checked={quietEnabled}
                        onChange={() => toggle(quietEnabled, setQuietEnabled, 'quiet_hours_enabled')}
                    />
                </div>

                {quietEnabled && (
                    <div className="mt-4 border-t border-white/10 pt-4">
                        <div className="flex items-center gap-3">
                            <TimeField label="From" value={quietStart} onChange={(v) => changeQuietTime('start', v)} />
                            <TimeField label="Until" value={quietEnd} onChange={(v) => changeQuietTime('end', v)} />
                        </div>
                        <p className="mt-3 text-xs text-white/40">Times are in {timezone.replace(/_/g, ' ')}.</p>
                        {deviceTimezone && deviceTimezone !== timezone && (
                            <button
                                onClick={useDeviceTimezone}
                                className="mt-2 text-xs font-medium text-pitch-light transition-colors hover:text-white"
                            >
                                Use this device&apos;s time zone ({deviceTimezone.replace(/_/g, ' ')})
                            </button>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}

function SwitchRow({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: () => void;
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <p className="text-sm font-semibold">{label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/50">{description}</p>
            </div>
            <button
                role="switch"
                aria-checked={checked}
                aria-label={label}
                onClick={onChange}
                className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-pitch' : 'bg-white/20'}`}
            >
                <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'
                        }`}
                />
            </button>
        </div>
    );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <label className="flex flex-1 flex-col gap-1.5 text-xs font-medium text-white/50">
            {label}
            <input
                type="time"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="rounded-lg bg-ink px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-pitch"
            />
        </label>
    );
}