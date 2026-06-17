-- Migration 002: Unify demo + real room architecture
-- Run in Supabase SQL Editor after phase2_migration.sql

-- Profiles: bot metadata
alter table profiles add column if not exists is_bot boolean default false;
alter table profiles add column if not exists bot_difficulty text
  check (bot_difficulty is null or bot_difficulty in ('easy', 'medium', 'hard'));

-- Rooms: match source + simulation state + bot config
alter table rooms add column if not exists match_source text default 'live_api';
alter table rooms add column if not exists bot_config_json jsonb
  default '{"enabled": false, "count": 0, "difficulty": "medium"}'::jsonb;
alter table rooms add column if not exists match_simulation_json jsonb;

-- Backfill match_source from legacy demo markers
update rooms
set match_source = 'demo_simulation'
where match_source is null
   or match_source = 'live_api'
  and (
    match_id = 'demo-sandbox'
    or (match_data->>'demo')::boolean is true
    or room_code ilike 'DEMO-%'
  );

update rooms
set match_source = 'live_api'
where match_source is null;

-- Copy match_data into simulation json for existing simulation rooms
update rooms
set match_simulation_json = match_data
where match_source in ('demo_simulation', 'manual')
  and match_simulation_json is null
  and match_data is not null;

-- Default bot config for simulation rooms
update rooms
set bot_config_json = '{"enabled": true, "count": 3, "difficulty": "medium"}'::jsonb
where match_source = 'demo_simulation'
  and (bot_config_json is null or (bot_config_json->>'count')::int = 0);

alter table rooms drop constraint if exists rooms_match_source_check;
alter table rooms add constraint rooms_match_source_check
  check (match_source in ('live_api', 'demo_simulation', 'manual'));

-- Unified event log
create table if not exists room_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  event_key text,
  event_type text,
  minute int,
  source text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_room_events_room on room_events(room_id, created_at desc);
create unique index if not exists idx_room_events_dedup
  on room_events(room_id, event_key) where event_key is not null;

-- Realtime: broadcast room_events to clients (optional — enable in Supabase dashboard)
-- alter publication supabase_realtime add table room_events;
