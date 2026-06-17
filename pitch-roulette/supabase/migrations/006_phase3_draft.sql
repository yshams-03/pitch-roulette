-- Migration 006: Fantasy draft phase
-- Run after 005_phase3_sides.sql

alter table rooms drop constraint if exists rooms_state_check;
alter table rooms add constraint rooms_state_check check (
  state in ('LOBBY','PREDICTING','CLOSED','DRAFTING','LIVE','FULL_TIME','RESULTS')
);

alter table rooms add column if not exists draft_started_at timestamptz;

create table if not exists draft_picks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  player_id text not null,
  player_name text not null,
  player_team text not null check (player_team in ('HOME','AWAY')),
  position text check (position in ('GK','DEF','MID','FWD')),
  pick_order int not null check (pick_order in (1,2,3)),
  pc_earned numeric default 0,
  picked_at timestamptz default now(),
  unique(room_id, player_id),
  unique(room_id, user_id, pick_order)
);

create index if not exists idx_draft_picks_room on draft_picks(room_id, user_id);

-- alter publication supabase_realtime add table draft_picks;
