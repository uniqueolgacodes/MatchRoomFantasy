// Home feed. PRD §19.4 (Personalized Feed) — news + upcoming fixtures
// for the user's followed teams, plus a way into their rooms.
export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">MatchRoom Fantasy</h1>
      <p className="mt-2 text-white/60">
        Your matchday feed will live here — news, upcoming fixtures, and your rooms.
      </p>
    </main>
  );
}
