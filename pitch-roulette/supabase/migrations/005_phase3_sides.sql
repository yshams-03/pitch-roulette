-- Migration 005: Side assignment (HOME/AWAY)
-- Run after 004_phase3_sabotage.sql

alter table room_players add column if not exists assigned_side text
  check (assigned_side in ('HOME', 'AWAY'));

alter table room_players add column if not exists side_swap_used boolean default false;
