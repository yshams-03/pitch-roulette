-- Migration 004: Sabotage shop — spend PC to mess with opponents during LIVE
-- Run in Supabase SQL Editor after 003_phase3_pitch_chips.sql

create table if not exists sabotages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  buyer_id uuid references profiles(id) on delete cascade,
  target_id uuid references profiles(id) on delete cascade,
  sabotage_type text not null check (sabotage_type in (
    'BLINDFOLD','TAX','SILENCE','JINX','MIRROR','DOUBLE_OR_NOTHING'
  )),
  pc_cost numeric not null,
  state text default 'ACTIVE' check (state in ('ACTIVE','TRIGGERED','EXPIRED')),
  flash_bet_id uuid references flash_bets(id) on delete set null,
  purchased_at timestamptz default now(),
  triggered_at timestamptz,
  expires_at timestamptz
);

create index if not exists idx_sabotages_room_target
  on sabotages(room_id, target_id, state);

create index if not exists idx_sabotages_room_active
  on sabotages(room_id, state, purchased_at desc);

-- Realtime (enable in Supabase dashboard if needed):
-- alter publication supabase_realtime add table sabotages;
