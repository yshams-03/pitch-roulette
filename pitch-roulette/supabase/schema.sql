-- Pitch Roulette Database Schema
-- Run in Supabase SQL Editor in order

-- Rooms table
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(6) UNIQUE NOT NULL,
  host_player_id UUID,
  match_id VARCHAR(50),
  match_name VARCHAR(200),
  team_a_name VARCHAR(100),
  team_b_name VARCHAR(100),
  state VARCHAR(20) DEFAULT 'LOBBY'
    CHECK (state IN ('LOBBY','SCOUTING','DRAFT_LOCKED','LIVE','FULL_TIME','RESULTS')),
  settings JSONB DEFAULT '{
    "allow_switching": true,
    "module_fantasy": true,
    "module_flash_bets": true,
    "module_sabotage": true,
    "chaos_frequency": "medium",
    "api_buffer_seconds": 3,
    "custom_switch_penalty": null
  }'::jsonb,
  underdog_team VARCHAR(1),
  underdog_multiplier DECIMAL(3,1) DEFAULT 1.0,
  squad_strength_a DECIMAL(4,1),
  squad_strength_b DECIMAL(4,1),
  handicap_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '8 hours'
);

-- Players table
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  nickname VARCHAR(30) NOT NULL,
  assigned_team VARCHAR(1) CHECK (assigned_team IN ('A','B')),
  balance INTEGER DEFAULT 1000,
  switched_team BOOLEAN DEFAULT FALSE,
  switch_penalty_paid INTEGER DEFAULT 0,
  is_host BOOLEAN DEFAULT FALSE,
  is_connected BOOLEAN DEFAULT TRUE,
  session_token VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fantasy squads
CREATE TABLE fantasy_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  api_player_id INTEGER NOT NULL,
  player_name VARCHAR(100),
  position VARCHAR(20),
  locked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flash bets
CREATE TABLE flash_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  bet_type VARCHAR(50) NOT NULL,
  event_label VARCHAR(200),
  options JSONB NOT NULL,
  frozen_until TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  winning_option VARCHAR(50),
  state VARCHAR(20) DEFAULT 'FROZEN'
    CHECK (state IN ('FROZEN','OPEN','CLOSED','RESOLVED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player wagers on flash bets
CREATE TABLE wagers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flash_bet_id UUID REFERENCES flash_bets(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  chosen_option VARCHAR(50) NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 10 AND amount <= 500),
  payout INTEGER,
  resolved BOOLEAN DEFAULT FALSE,
  placed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sabotage tokens
CREATE TABLE sabotages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES players(id) ON DELETE CASCADE,
  target_id UUID REFERENCES players(id) ON DELETE CASCADE,
  token_type VARCHAR(30) NOT NULL
    CHECK (token_type IN ('BLINDFOLD','TAX_COLLECTOR','CHAT_SILENCER','JINX','MIRROR')),
  cost INTEGER NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  deployed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID,
  nickname VARCHAR(30),
  content TEXT NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fantasy scores (updated live)
CREATE TABLE fantasy_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  api_player_id INTEGER NOT NULL,
  current_rating DECIMAL(3,1) DEFAULT 0.0,
  bonus_pc INTEGER DEFAULT 0,
  penalty_pc INTEGER DEFAULT 0,
  total_fantasy_score DECIMAL(5,1) DEFAULT 0.0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, room_id, api_player_id)
);

-- Enable Supabase Realtime on all relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE flash_bets;
ALTER PUBLICATION supabase_realtime ADD TABLE wagers;
ALTER PUBLICATION supabase_realtime ADD TABLE sabotages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE fantasy_scores;

-- Row Level Security: disable for service key access (backend controls all writes)
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE players DISABLE ROW LEVEL SECURITY;
ALTER TABLE flash_bets DISABLE ROW LEVEL SECURITY;
ALTER TABLE wagers DISABLE ROW LEVEL SECURITY;
ALTER TABLE sabotages DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_picks DISABLE ROW LEVEL SECURITY;
