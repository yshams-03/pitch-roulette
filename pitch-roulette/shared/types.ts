export type RoomState = 'LOBBY' | 'SCOUTING' | 'DRAFT_LOCKED' | 'LIVE' | 'FULL_TIME' | 'RESULTS';
export type TeamLetter = 'A' | 'B';
export type SabotageType = 'BLINDFOLD' | 'TAX_COLLECTOR' | 'CHAT_SILENCER' | 'JINX' | 'MIRROR';
export type FlashBetState = 'FROZEN' | 'OPEN' | 'CLOSED' | 'RESOLVED';

export interface RoomSettings {
  allow_switching: boolean;
  module_fantasy: boolean;
  module_flash_bets: boolean;
  module_sabotage: boolean;
  chaos_frequency: string;
  api_buffer_seconds: number;
  custom_switch_penalty: number | null;
  test_mode?: boolean;
  fantasy_pick_count?: number;
  fantasy_all_teams?: boolean;
  score_predictions?: Record<string, { score_a: number; score_b: number }>;
}

export interface Player {
  id: string;
  room_id: string;
  nickname: string;
  assigned_team: TeamLetter | null;
  balance: number;
  switched_team: boolean;
  switch_penalty_paid: number;
  is_host: boolean;
  is_connected: boolean;
  session_token: string;
  created_at: string;
}

export interface FantasyPick {
  id: string;
  player_id: string;
  room_id: string;
  api_player_id: number;
  player_name: string;
  position: string;
  locked_at: string;
}

export interface FantasyScore {
  id: string;
  player_id: string;
  room_id: string;
  api_player_id: number;
  current_rating: number;
  bonus_pc: number;
  penalty_pc: number;
  total_fantasy_score: number;
  last_updated: string;
}

export interface FlashBetOption {
  label: string;
  multiplier: number;
}

export interface FlashBet {
  id: string;
  room_id: string;
  bet_type: string;
  event_label: string;
  options: Record<string, FlashBetOption>;
  frozen_until: string;
  closes_at: string;
  resolved_at: string | null;
  winning_option: string | null;
  state: FlashBetState;
  created_at: string;
}

export interface Sabotage {
  id: string;
  room_id: string;
  sender_id: string;
  target_id: string;
  token_type: SabotageType;
  cost: number;
  active: boolean;
  expires_at: string;
  deployed_at: string;
  sender_nickname?: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  player_id: string | null;
  nickname: string;
  content: string;
  is_system: boolean;
  created_at: string;
}

export interface Room {
  id: string;
  code: string;
  host_player_id: string;
  match_id: string | null;
  match_name: string | null;
  team_a_name: string | null;
  team_b_name: string | null;
  state: RoomState;
  settings: RoomSettings;
  underdog_team: TeamLetter | null;
  underdog_multiplier: number;
  squad_strength_a: number | null;
  squad_strength_b: number | null;
  handicap_active: boolean;
  players?: Player[];
}

export interface LineupPlayer {
  id: number;
  name: string;
  number: number;
  pos: string;
}

export interface MatchSearchResult {
  id: number;
  date: string;
  venue: string;
  team_a: string;
  team_b: string;
  team_a_logo?: string;
  team_b_logo?: string;
}
