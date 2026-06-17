-- Migration 003: Pitch Chips (PC) — per-room party currency
-- Run in Supabase SQL Editor after 002_unify_demo.sql

alter table room_players add column if not exists session_pc numeric default 100;

-- Existing players in active rooms get starting balance
update room_players set session_pc = 100 where session_pc is null;

create table if not exists pc_transactions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  amount numeric not null,
  reason text not null check (reason in (
    'flash_bet_win', 'flash_bet_loss', 'sabotage_purchase', 'sabotage_received',
    'starting_allowance', 'underdog_bonus', 'side_swap', 'draft_reward'
  )),
  related_id uuid,
  created_at timestamptz default now()
);

create index if not exists idx_pc_transactions_room_user
  on pc_transactions(room_id, user_id, created_at desc);

-- Realtime (enable in Supabase dashboard if needed):
-- alter publication supabase_realtime add table pc_transactions;
