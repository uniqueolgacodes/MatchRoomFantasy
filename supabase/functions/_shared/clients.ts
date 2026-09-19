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

export function normalizeStatus(apiFootballStatus: string): string {
  const map: Record<string, string> = {
    'TBD': 'scheduled', 'NS': 'scheduled',
    '1H': 'live', 'HT': 'half_time', '2H': 'live',
    'ET': 'live', 'BT': 'live', 'P': 'live',
    'FT': 'full_time', 'AET': 'full_time', 'PEN': 'full_time',
    'PST': 'postponed', 'CANC': 'cancelled', 'SUSP': 'suspended', 'ABD': 'cancelled',
  };
  return map[apiFootballStatus] ?? 'scheduled';
}
