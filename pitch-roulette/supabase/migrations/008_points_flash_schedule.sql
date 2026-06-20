-- PP breakdown on predictions + scheduled flash bet metadata

alter table predictions
  add column if not exists pp_breakdown jsonb;

alter table flash_bets
  add column if not exists answer_key text,
  add column if not exists match_minute int,
  add column if not exists match_context_snapshot jsonb,
  add column if not exists auto_resolved boolean default false;

create table if not exists flash_bet_minutes (
  room_id uuid references rooms(id) on delete cascade,
  match_minute int not null,
  flash_bet_id uuid references flash_bets(id) on delete set null,
  fired_at timestamptz default now(),
  primary key (room_id, match_minute)
);

create index if not exists idx_flash_bets_match_minute on flash_bets(room_id, match_minute);
