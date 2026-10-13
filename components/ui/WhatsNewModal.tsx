'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function WhatsNewModal() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const hasSeen = localStorage.getItem('matchroom_whats_new_v1');
        if (!hasSeen) {
            // Delay so it doesn't collide with the Beta Warning
            const timer = setTimeout(() => setShow(true), 2500);
            return () => clearTimeout(timer);
        }
    }, []);

    function dismiss() {
        localStorage.setItem('matchroom_whats_new_v1', 'true');
        setShow(false);
    }

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 20 }}
                        className="w-full max-w-sm rounded-3xl border border-pitch/30 bg-ink-soft p-6 shadow-2xl"
                    >
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pitch/20 text-2xl">
                            ✨
                        </div>
                        <h2 className="mt-4 font-display text-xl font-bold">New in MatchRoom</h2>
                        <p className="mt-2 text-sm text-white/60">
                            We just dropped a massive update to make matchdays better:
                        </p>

                        <ul className="mt-4 space-y-3 text-sm text-white/80">
                            <li className="flex items-start gap-2">
                                <span className="shrink-0 text-pitch-light">🔊</span>
                                <span><strong>Sound System:</strong> The app now features stadium sounds, referee whistles, and win notifications.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="shrink-0 text-pitch-light">🔥</span>
                                <span><strong>Live Reactions:</strong> Tap emojis during Virtual Matches to react with everyone else watching.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="shrink-0 text-pitch-light">🏆</span>
                                <span><strong>Trophy Room:</strong> Check your profile. Win big, unlock badges, and share them on WhatsApp.</span>
                            </li>
                        </ul>

                        <button
                            onClick={dismiss}
                            className="mt-6 w-full rounded-xl bg-pitch px-4 py-3 font-semibold transition-colors hover:bg-pitch-dark"
                        >
                            Check it out
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}