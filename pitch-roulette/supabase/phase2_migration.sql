-- Pitch Roulette Phase 2 — run AFTER schema.sql (does not drop Phase 1 data)

-- Room state machine: LOBBY → PREDICTING → CLOSED → LIVE → FULL_TIME → RESULTS
alter table rooms drop constraint if exists rooms_state_check;
alter table rooms add constraint rooms_state_check
  check (state in ('LOBBY','PREDICTING','CLOSED','LIVE','FULL_TIME','RESULTS'));

alter table rooms add column if not exists chat_enabled boolean default true;
alter table rooms add column if not exists last_seen_event_key text;
alter table rooms add column if not exists espn_event_id text;

create index if not exists idx_rooms_espn_event on rooms(espn_event_id);

alter table room_players add column if not exists session_pp numeric default 0;

-- Flash bets
create table if not exists flash_bets (
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

create index if not exists idx_flash_bets_room on flash_bets(room_id);
create index if not exists idx_flash_bets_state on flash_bets(room_id, state);

create table if not exists flash_bet_answers (
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

create index if not exists idx_flash_bet_answers_bet on flash_bet_answers(flash_bet_id);

-- Room chat
create table if not exists room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  username text not null,
  content text not null check (char_length(content) <= 200),
  is_deleted boolean default false,
  sent_at timestamptz default now()
);

create index if not exists idx_room_messages_room on room_messages(room_id, sent_at desc);

-- Realtime publications
do $$ begin alter publication supabase_realtime add table flash_bets; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table flash_bet_answers; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table room_messages; exception when duplicate_object then null; end $$;
