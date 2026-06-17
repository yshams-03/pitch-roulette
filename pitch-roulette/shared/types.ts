export type RoomState = 'LOBBY' | 'PREDICTING' | 'CLOSED' | 'LIVE' | 'FULL_TIME' | 'RESULTS';
export type PredictedOutcome = 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';
export type LeaderboardPeriod = 'alltime' | 'month' | 'week';
export type FlashBetState = 'PENDING' | 'OPEN' | 'LOCKED' | 'RESOLVED';
export type WagerTier = 'LOW' | 'MEDIUM' | 'HIGH';

export type MatchSource = 'live_api' | 'demo_simulation' | 'manual';
export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface BotConfig {
  enabled: boolean;
  count: number;
  difficulty: BotDifficulty;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  total_points: number;
  total_predictions: number;
  correct_outcomes: number;
  exact_scores: number;
  current_streak: number;
  best_streak: number;
  rooms_created: number;
  created_at: string;
  global_rank?: number;
  global_rank_percentile?: number;
}

export interface FriendGroup {
  id: string;
  name: string;
  emoji: string;
  invite_code: string;
  created_by: string | null;
  created_at: string;
  member_count?: number;
}

export interface GroupMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  group_points: number;
  total_predictions?: number;
  exact_scores?: number;
  win_rate?: number;
  rank?: number;
}

export interface MatchSummary {
  id: string;
  home_team: string;
  away_team: string;
  home_logo?: string | null;
  away_logo?: string | null;
  kickoff: string;
  status: string;
  status_label: string;
  minute?: number | null;
  home_goals: number;
  away_goals: number;
  group_name?: string | null;
  stage?: string | null;
  venue?: string | null;
  is_live: boolean;
  demo?: boolean;
  events_log?: MatchEventLog[];
}

export interface MatchEventLog {
  type: string;
  minute: number;
  home_goals: number;
  away_goals: number;
  event_key?: string;
  at?: string;
}

export interface StandingRow {
  rank: number;
  team: string;
  team_logo?: string | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  group?: string | null;
}

export interface Room {
  id: string;
  room_code: string;
  match_id: string;
  match_source?: MatchSource;
  bot_config_json?: BotConfig | null;
  espn_event_id?: string | null;
  match_data: MatchSummary | null;
  host_id: string | null;
  group_id: string | null;
  state: RoomState;
  chat_enabled?: boolean;
  actual_home_goals: number | null;
  actual_away_goals: number | null;
  created_at: string;
  players?: RoomPlayer[];
  predictions?: Prediction[];
}

export interface RoomPlayer {
  id: string;
  room_id: string;
  user_id: string;
  is_host: boolean;
  joined_at: string;
  username?: string;
  display_name?: string;
  avatar_color?: string;
  session_pp?: number;
  session_pc?: number;
}

export interface Prediction {
  id: string;
  room_id: string;
  user_id: string;
  match_id: string;
  home_goals: number;
  away_goals: number;
  predicted_outcome: PredictedOutcome;
  points_earned: number;
  is_first_submission: boolean;
  submitted_at: string;
  username?: string;
  display_name?: string;
  avatar_color?: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  total_points: number;
  total_predictions: number;
  exact_scores: number;
  correct_outcomes: number;
  win_rate: number;
  is_me?: boolean;
}

export interface FlashBet {
  id: string;
  room_id: string;
  triggered_by: 'AUTO' | 'HOST';
  question: string;
  options: string[];
  correct_option: string | null;
  wager_tier: WagerTier;
  wager_amount: number;
  state: FlashBetState;
  opens_at: string | null;
  locks_at: string | null;
  resolved_at: string | null;
  match_event_type: string | null;
  created_at: string;
}

export interface FlashBetAnswer {
  id: string;
  flash_bet_id: string;
  user_id: string;
  chosen_option: string;
  is_correct: boolean | null;
  pp_change: number;
  answered_at: string;
  username?: string;
  display_name?: string;
}

export interface RoomMessage {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  content: string;
  is_deleted: boolean;
  sent_at: string;
}
