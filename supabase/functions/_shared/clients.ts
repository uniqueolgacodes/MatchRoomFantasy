// Shared Supabase service-role client + Sentry init.
// Every settlement/polling function imports this instead of
// re-initializing its own clients.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as Sentry from 'https://esm.sh/@sentry/deno@7';

Sentry.init({ dsn: Deno.env.get('SENTRY_DSN') ?? '' });

export { Sentry };

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

export function normalizeFootballDataStatus(status: string): string {
  const map: Record<string, string> = {
    SCHEDULED: 'scheduled', TIMED: 'scheduled',
    IN_PLAY: 'live', PAUSED: 'half_time',
    FINISHED: 'full_time', AWARDED: 'full_time',
    POSTPONED: 'postponed', SUSPENDED: 'suspended', CANCELLED: 'cancelled',
  };
  return map[status] ?? 'scheduled';
}
