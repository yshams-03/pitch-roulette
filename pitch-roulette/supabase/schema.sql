-- Pitch Roulette Phase 1 — run in Supabase SQL Editor
-- Drops legacy Phase 0 tables, then creates Phase 1 schema fresh.

create extension if not exists "pgcrypto";

-- ─── Remove legacy Phase 0 tables (party game) ─────────────────────────────
drop table if exists wagers cascade;
drop table if exists flash_bets cascade;
drop table if exists sabotages cascade;
drop table if exists chat_messages cascade;
drop table if exists fantasy_scores cascade;
drop table if exists fantasy_picks cascade;
drop table if exists players cascade;

-- ─── Remove Phase 1 tables (safe re-run) ───────────────────────────────────
drop table if exists predictions cascade;
drop table if exists room_players cascade;
drop table if exists rooms cascade;
drop table if exists group_members cascade;
drop table if exists friend_groups cascade;
drop table if exists profiles cascade;
drop table if exists api_cache cascade;

-- ─── API cache ─────────────────────────────────────────────────────────────
create table api_cache (
  cache_key text primary key,
  data jsonb not null,
  fetched_at timestamptz default now(),
  expires_at timestamptz not null
);

create index idx_api_cache_expires on api_cache(expires_at);

-- ─── Profiles (extends auth.users) ─────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_color text default '#22c55e',
  is_bot boolean default false,
  bot_difficulty text check (bot_difficulty in ('easy', 'medium', 'hard')),
  total_points numeric default 0,
  total_predictions int default 0,
  correct_outcomes int default 0,
  exact_scores int default 0,
  current_streak int default 0,
  best_streak int default 0,
  rooms_created int default 0,
  created_at timestamptz default now()
);

create index idx_profiles_total_points on profiles(total_points desc);
create index idx_profiles_username on profiles(username);

-- ─── Friend groups ─────────────────────────────────────────────────────────
create table friend_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text default '⚽',
  invite_code text unique not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references friend_groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  group_points numeric default 0,
  joined_at timestamptz default now(),
  unique(group_id, user_id)
);

create index idx_group_members_group on group_members(group_id);
create index idx_group_members_user on group_members(user_id);

-- ─── Rooms ─────────────────────────────────────────────────────────────────
create table rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  match_id text not null,
  match_data jsonb,
  match_source text default 'live_api' check (match_source in ('live_api', 'demo_simulation', 'manual')),
  bot_config_json jsonb default '{"enabled": false, "count": 0, "difficulty": "medium"}'::jsonb,
  match_simulation_json jsonb,
  espn_event_id text,
  host_id uuid references profiles(id),
  group_id uuid references friend_groups(id),
  state text default 'LOBBY' check (state in ('LOBBY','PREDICTING','CLOSED','LIVE','FULL_TIME','RESULTS')),
  actual_home_goals int,
  actual_away_goals int,
  chat_enabled boolean default true,
  last_seen_event_key text,
  created_at timestamptz default now()
);

create index idx_rooms_code on rooms(room_code);
create index idx_rooms_group on rooms(group_id);

-- ─── Room players ────────────────────────────────────────────────────────────
create table room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  is_host boolean default false,
  session_pp numeric default 0,
  joined_at timestamptz default now(),
  unique(room_id, user_id)
);

-- ─── Predictions ───────────────────────────────────────────────────────────
create table predictions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  match_id text not null,
  home_goals int not null check (home_goals >= 0 and home_goals <= 20),
  away_goals int not null check (away_goals >= 0 and away_goals <= 20),
  predicted_outcome text not null check (predicted_outcome in ('HOME_WIN','DRAW','AWAY_WIN')),
  points_earned numeric default 0,
  is_first_submission boolean default false,
  submitted_at timestamptz default now(),
  unique(room_id, user_id)
);

create index idx_predictions_room on predictions(room_id);
create index idx_predictions_user on predictions(user_id);

-- ─── Flash bets (Phase 2) ───────────────────────────────────────────────────
create table flash_bets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  triggered_by text not null check (triggered_by in ('AUTO','HOST')),
  question text not null,
  options jsonb not null,
  correct_option text,
  wager_tier text default 'MEDIUM' check (wager_tier in ('LOW','MEDIUM','HIGH')),
  wager_amount numeric not null default 1,
  state text default 'PENDING' check (state in ('PENDING','OPEN','LOCKED','RESOLVED')),
  opens_at timestamptz,
  locks_at timestamptz,
  resolved_at timestamptz,
  match_event_type text,
  event_key text,
  created_at timestamptz default now(),
  unique(room_id, event_key)
);

create index idx_flash_bets_room on flash_bets(room_id);

-- ─── Room events (unified event log) ───────────────────────────────────────
create table room_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  event_key text,
  event_type text,
  minute int,
  source text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index idx_room_events_room on room_events(room_id, created_at desc);
create unique index idx_room_events_dedup on room_events(room_id, event_key) where event_key is not null;

create table flash_bet_answers (
  id uuid primary key default gen_random_uuid(),
  flash_bet_id uuid references flash_bets(id) on delete cascade,
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  chosen_option text not null,
  is_correct boolean,
  pp_change numeric default 0,
  answered_at timestamptz default now(),
  unique(flash_bet_id, user_id)
);

create table room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  username text not null,
  content text not null check (char_length(content) <= 200),
  is_deleted boolean default false,
  sent_at timestamptz default now()
);

create index idx_room_messages_room on room_messages(room_id, sent_at desc);

-- ─── Realtime (ignore if already subscribed) ─────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table rooms;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table room_players;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table predictions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table group_members;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table profiles;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table flash_bets;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table flash_bet_answers;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table room_messages;
exception when duplicate_object then null;
end $$;

-- ─── Auto-create profile on signup ───────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_username text;
  final_username text;
begin
  base_username := lower(coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)));
  final_username := base_username;

  begin
    insert into public.profiles (id, username, display_name, avatar_color)
    values (
      new.id,
      final_username,
      coalesce(new.raw_user_meta_data->>'display_name', 'Player'),
      coalesce(new.raw_user_meta_data->>'avatar_color', '#22c55e')
    );
  exception when unique_violation then
    final_username := base_username || '_' || substr(replace(new.id::text, '-', ''), 1, 6);
    insert into public.profiles (id, username, display_name, avatar_color)
    values (
      new.id,
      final_username,
      coalesce(new.raw_user_meta_data->>'display_name', 'Player'),
      coalesce(new.raw_user_meta_data->>'avatar_color', '#22c55e')
    );
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill profiles for existing auth users (if any)
insert into profiles (id, username, display_name, avatar_color)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'username', 'user_' || substr(u.id::text, 1, 8)),
  coalesce(u.raw_user_meta_data->>'display_name', 'Player'),
  coalesce(u.raw_user_meta_data->>'avatar_color', '#22c55e')
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id)
on conflict (id) do nothing;
