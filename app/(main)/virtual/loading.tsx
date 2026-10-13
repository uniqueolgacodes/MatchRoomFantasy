// Specific loading skeleton for the Virtual Hub
export default function VirtualLoadingSkeleton() {
    return (
        <main className="mx-auto max-w-2xl px-4 py-8 w-full animate-pulse">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <div className="h-8 w-48 rounded-lg bg-white/10" />
                    <div className="mt-2 h-4 w-64 rounded-lg bg-white/5" />
                </div>
                <div className="h-12 w-16 rounded-xl bg-pitch/10" />
            </div>

            {/* Live Match Card Skeleton */}
            <div className="mt-6">
                <div className="h-4 w-24 rounded bg-white/10 mb-3" />
                <div className="rounded-xl border border-white/5 bg-ink-soft p-5 h-64 flex flex-col justify-between">
                    <div className="flex justify-between">
                        <div className="h-4 w-20 rounded bg-white/10" />
                        <div className="h-4 w-24 rounded bg-white/5" />
                    </div>

                    <div className="flex items-center justify-center gap-6">
                        <div className="flex flex-col items-center gap-2">
                            <div className="h-10 w-10 rounded-full bg-white/10" />
                            <div className="h-3 w-16 rounded bg-white/10" />
                        </div>
                        <div className="h-10 w-24 rounded-lg bg-white/5" />
                        <div className="flex flex-col items-center gap-2">
                            <div className="h-10 w-10 rounded-full bg-white/10" />
                            <div className="h-3 w-16 rounded bg-white/10" />
                        </div>
                    </div>

                    <div className="h-2 w-full rounded-full bg-black/40 mt-6" />

                    <div className="flex justify-center gap-3 mt-4">
                        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 w-10 rounded-full bg-white/5" />)}
                    </div>
                </div>
            </div>

            {/* Upcoming Set Skeleton */}
            <div className="mt-8">
                <div className="h-4 w-24 rounded bg-white/10 mb-3" />
                <div className="rounded-xl border border-white/5 bg-ink-soft p-5 h-32">
                    <div className="flex justify-between mb-6">
                        <div className="h-4 w-24 rounded bg-white/10" />
                        <div className="h-4 w-12 rounded bg-white/10" />
                    </div>
                    <div className="h-12 w-full rounded-lg bg-white/5" />
                </div>
            </div>
        </main>
    );
}