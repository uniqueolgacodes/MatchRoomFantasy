// Automatically triggered by Next.js during any server-side data fetch 
// (e.g., navigating to Home, a Room, or a Match).
export default function GlobalLoadingSkeleton() {
    return (
        <main className="mx-auto max-w-2xl px-4 py-8 w-full animate-pulse">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="h-7 w-40 rounded-lg bg-white/10" />
                    <div className="mt-2 h-4 w-60 rounded-lg bg-white/5" />
                </div>
                <div className="h-12 w-16 rounded-xl bg-pitch/10" />
            </div>

            {/* Quick Nav Skeleton */}
            <div className="mt-6 flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-8 w-24 rounded-full bg-white/10" />
                ))}
            </div>

            {/* Main Content Area Skeletons */}
            <div className="mt-10 space-y-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="h-4 w-24 rounded bg-white/10" />
                    <div className="h-3 w-16 rounded bg-white/5" />
                </div>

                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex h-24 items-center justify-between rounded-xl bg-ink-soft px-4 py-3 border border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-white/10" />
                            <div className="h-4 w-20 rounded bg-white/10" />
                        </div>
                        <div className="h-6 w-12 rounded bg-white/10" />
                        <div className="flex items-center gap-3">
                            <div className="h-4 w-20 rounded bg-white/10" />
                            <div className="h-10 w-10 rounded-full bg-white/10" />
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
}