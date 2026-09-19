-- Baseline Row-Level Security.
-- The PRD doesn't spell out RLS policies in detail — these are a safe
-- starting point (read-your-own / read-your-room), not a final policy
-- set. Review before relying on them for anything sensitive.

alter table profiles enable row level security;
alter table point_balances enable row level security;
alter table point_transactions enable row level security;
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table room_messages enable row level security;
alter table prediction_stakes enable row level security;
alter table push_subscriptions enable row level security;
alter table redemptions enable row level security;
alter table revival_spins enable row level security;

-- Profiles: anyone can read (usernames/avatars are shown across the
-- app), only the owner can update their own row.
create policy "profiles are publicly readable"
  on profiles for select using (true);

create policy "users update their own profile"
  on profiles for update using (auth.uid() = id);

-- Point balances / transactions: users see only their own ledger.
create policy "users read their own balance"
  on point_balances for select using (auth.uid() = user_id);

create policy "users read their own transactions"
  on point_transactions for select using (auth.uid() = user_id);

-- Rooms: public rooms are readable by anyone; private rooms only by
-- members. Only the owner can update/delete.
create policy "public rooms are readable"
  on rooms for select using (
    visibility = 'public'
    or exists (
      select 1 from room_members
      where room_members.room_id = rooms.id and room_members.user_id = auth.uid()
    )
  );

create policy "owners manage their rooms"
  on rooms for update using (auth.uid() = owner_id);

create policy "authenticated users create rooms"
  on rooms for insert with check (auth.uid() = owner_id);

-- Room members: members of a room can see the member list.
create policy "members read their room's membership"
  on room_members for select using (
    exists (
      select 1 from room_members rm
      where rm.room_id = room_members.room_id and rm.user_id = auth.uid()
    )
  );

create policy "users join rooms for themselves"
  on room_members for insert with check (auth.uid() = user_id);

-- Room messages: only room members can read or post.
create policy "members read room messages"
  on room_messages for select using (
    exists (
      select 1 from room_members
      where room_members.room_id = room_messages.room_id and room_members.user_id = auth.uid()
    )
  );

create policy "members post room messages"
  on room_messages for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from room_members
      where room_members.room_id = room_messages.room_id and room_members.user_id = auth.uid()
    )
  );

-- Prediction stakes: users see and create only their own stakes.
-- Settlement writes happen via the service role from Edge Functions,
-- which bypasses RLS.
create policy "users read their own stakes"
  on prediction_stakes for select using (auth.uid() = user_id);

create policy "users create their own stakes"
  on prediction_stakes for insert with check (auth.uid() = user_id);

-- Push subscriptions: users manage only their own.
create policy "users manage their own push subscriptions"
  on push_subscriptions for all using (auth.uid() = user_id);

-- Redemptions / revival spins: users read only their own history.
create policy "users read their own redemptions"
  on redemptions for select using (auth.uid() = user_id);

create policy "users create their own redemptions"
  on redemptions for insert with check (auth.uid() = user_id);

create policy "users read their own revival spins"
  on revival_spins for select using (auth.uid() = user_id);
