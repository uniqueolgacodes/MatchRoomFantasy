// PRD §25 Trophy Room & Winner Cards
// Evaluates achievements dynamically based on the user's settled stakes.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function TrophyRoomPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null; // middleware already redirects

  // Fetch all settled stakes for this user to calculate achievements
  const { data: stakes } = await supabase
    .from('prediction_stakes')
    .select('stake, potential_payout, is_correct, predictions(category)')
    .eq('user_id', user.id)
    .not('is_correct', 'is', null);

  const wins = (stakes || []).filter((s) => s.is_correct === true);

  // 1. First Win: Won at least 1 bet
  const hasFirstWin = wins.length > 0;

  // 2. Underdog: Won a bet with 4.0x odds or higher
  const hasUnderdog = wins.some((s) => (s.potential_payout / s.stake) >= 4.0);

  // 3. Sniper: Won a correct_score market
  const hasSniper = wins.some((s) => {
    // Handling array or object relationships from Supabase
    const category = Array.isArray(s.predictions) ? s.predictions[0]?.category : (s.predictions as any)?.category;
    return category === 'correct_score';
  });

  // 4. High Roller: Won a max stake (20 MP)
  const hasHighRoller = wins.some((s) => s.stake >= 20);

  // 5. Centurion: Won 100+ predictions total
  const hasCenturion = wins.length >= 100;

  const TROPHIES = [
    {
      id: 'first_win',
      name: 'Off the Mark',
      description: 'Won your first prediction.',
      emoji: '🏅',
      unlocked: hasFirstWin,
    },
    {
      id: 'underdog',
      name: 'The Underdog',
      description: 'Won a prediction with 4.0x odds or higher.',
      emoji: '🐺',
      unlocked: hasUnderdog,
    },
    {
      id: 'sniper',
      name: 'Sniper',
      description: 'Nailed a Correct Score prediction exactly.',
      emoji: '🎯',
      unlocked: hasSniper,
    },
    {
      id: 'high_roller',
      name: 'High Roller',
      description: 'Won a maximum stake (20 MP) prediction.',
      emoji: '💎',
      unlocked: hasHighRoller,
    },
    {
      id: 'centurion',
      name: 'Centurion',
      description: 'Won 100 predictions across all time.',
      emoji: '👑',
      unlocked: hasCenturion,
    },
  ];

  const unlockedCount = TROPHIES.filter(t => t.unlocked).length;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/profile" className="inline-flex items-center gap-1 text-sm text-white/50 transition-colors hover:text-white">
        ← Back to Profile
      </Link>

      <div className="mt-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Trophy Room</h1>
          <p className="mt-1 text-sm text-white/50">Your bragging rights. You have unlocked {unlockedCount} / {TROPHIES.length}.</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TROPHIES.map((t) => {
          const shareText = `I just unlocked the "${t.name}" trophy in MatchRoom Fantasy! ${t.emoji} \n\nThink you can beat me? Join the action at matchroom.app`;
          const shareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

          return (
            <div
              key={t.id}
              className={`relative overflow-hidden rounded-xl border p-5 transition-all ${t.unlocked
                  ? 'border-pitch/40 bg-ink-soft shadow-[0_0_15px_rgba(22,163,74,0.1)]'
                  : 'border-white/5 bg-white/[0.02] opacity-60 grayscale'
                }`}
            >
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${t.unlocked ? 'bg-pitch/20' : 'bg-white/10'}`}>
                  {t.emoji}
                </div>
                <div className="flex-1">
                  <h2 className="font-display text-lg font-bold text-white">{t.name}</h2>
                  <p className="mt-1 text-xs text-white/60">{t.description}</p>
                </div>
              </div>

              {t.unlocked ? (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                    </svg>
                    Flex to WhatsApp
                  </a>
                </div>
              ) : (
                <div className="absolute right-4 top-4 text-white/10">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}