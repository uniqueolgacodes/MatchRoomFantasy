'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function BetaWarningModal() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const hasSeen = localStorage.getItem('matchroom_beta_warning_seen');
        if (!hasSeen) {
            // Small delay so it doesn't jarringly block the immediate page load
            const timer = setTimeout(() => setShow(true), 1200);
            return () => clearTimeout(timer);
        }
    }, []);

    function dismiss() {
        localStorage.setItem('matchroom_beta_warning_seen', 'true');
        setShow(false);
    }

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 20 }}
                        className="w-full max-w-sm rounded-2xl border border-floodlight/30 bg-ink-soft p-6 shadow-2xl"
                    >
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-floodlight/20 text-2xl">
                            🚧
                        </div>
                        <h2 className="mt-4 font-display text-xl font-bold">We&apos;re in Beta</h2>
                        <p className="mt-2 text-sm leading-relaxed text-white/70">
                            Welcome to MatchRoom! We are still testing things out. You might encounter some bugs, and features (like points or rooms) could reset while we fine-tune the system.
                        </p>
                        <button
                            onClick={dismiss}
                            className="mt-6 w-full rounded-lg bg-pitch px-4 py-3 font-semibold transition-colors hover:bg-pitch-dark"
                        >
                            I understand
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}