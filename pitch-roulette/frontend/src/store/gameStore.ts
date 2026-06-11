import { create } from 'zustand';
import type {
  ChatMessage,
  FantasyPick,
  FantasyScore,
  FlashBet,
  Player,
  RoomSettings,
  RoomState,
  Sabotage,
  TeamLetter,
} from '../../../shared/types';

interface GameStore {
  sessionToken: string | null;
  playerId: string | null;
  roomCode: string | null;
  roomId: string | null;
  isHost: boolean;
  isReconnecting: boolean;

  roomState: RoomState;
  players: Player[];
  settings: RoomSettings;

  myBalance: number;
  myTeam: TeamLetter | null;
  myFantasyPicks: FantasyPick[];
  myFantasyScores: FantasyScore[];

  activeBet: FlashBet | null;
  activeSabotages: Sabotage[];
  chatMessages: ChatMessage[];

  matchId: string | null;
  teamAName: string;
  teamBName: string;
  liveScore: { a: number; b: number };
  matchClock: string;

  underdogTeam: TeamLetter | null;
  underdogMultiplier: number;
  handicapActive: boolean;

  lineupPlayers: Array<{ id: number; name: string; number: number; pos: string; team: string }>;

  setSession: (token: string, playerId: string, roomCode: string, isHost: boolean) => void;
  setRoomId: (id: string) => void;
  setReconnecting: (v: boolean) => void;
  setRoomState: (state: RoomState) => void;
  setPlayers: (players: Player[]) => void;
  setSettings: (settings: RoomSettings) => void;
  setMyBalance: (balance: number) => void;
  setMyTeam: (team: TeamLetter | null) => void;
  setMyFantasyPicks: (picks: FantasyPick[]) => void;
  setMyFantasyScores: (scores: FantasyScore[]) => void;
  setActiveBet: (bet: FlashBet | null) => void;
  setActiveSabotages: (sabotages: Sabotage[]) => void;
  appendChatMessage: (msg: ChatMessage) => void;
  setChatMessages: (msgs: ChatMessage[]) => void;
  setMatchInfo: (matchId: string | null, teamA: string, teamB: string) => void;
  setLiveScore: (score: { a: number; b: number }, clock: string) => void;
  setUnderdog: (team: TeamLetter | null, multiplier: number) => void;
  setHandicapActive: (active: boolean) => void;
  setLineupPlayers: (players: Array<{ id: number; name: string; number: number; pos: string; team: string }>) => void;
  hydrateFromRoom: (room: Record<string, unknown>, myPlayerId?: string) => void;
  reset: () => void;
}

const defaultSettings: RoomSettings = {
  allow_switching: true,
  module_fantasy: true,
  module_flash_bets: true,
  module_sabotage: true,
  chaos_frequency: 'medium',
  api_buffer_seconds: 3,
  custom_switch_penalty: null,
};

const initialState = {
  sessionToken: null,
  playerId: null,
  roomCode: null,
  roomId: null,
  isHost: false,
  isReconnecting: false,
  roomState: 'LOBBY' as RoomState,
  players: [] as Player[],
  settings: defaultSettings,
  myBalance: 1000,
  myTeam: null as TeamLetter | null,
  myFantasyPicks: [] as FantasyPick[],
  myFantasyScores: [] as FantasyScore[],
  activeBet: null as FlashBet | null,
  activeSabotages: [] as Sabotage[],
  chatMessages: [] as ChatMessage[],
  matchId: null as string | null,
  teamAName: 'Team A',
  teamBName: 'Team B',
  liveScore: { a: 0, b: 0 },
  matchClock: "0'",
  underdogTeam: null as TeamLetter | null,
  underdogMultiplier: 1.0,
  handicapActive: false,
  lineupPlayers: [] as Array<{ id: number; name: string; number: number; pos: string; team: string }>,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setSession: (token, playerId, roomCode, isHost) =>
    set({ sessionToken: token, playerId, roomCode, isHost }),

  setRoomId: (id) => set({ roomId: id }),
  setReconnecting: (v) => set({ isReconnecting: v }),
  setRoomState: (state) => set({ roomState: state }),
  setPlayers: (players) => {
    const { playerId } = get();
    const me = players.find((p) => p.id === playerId);
    set({
      players,
      myBalance: me?.balance ?? get().myBalance,
      myTeam: me?.assigned_team ?? get().myTeam,
    });
  },
  setSettings: (settings) => set({ settings }),
  setMyBalance: (balance) => set({ myBalance: balance }),
  setMyTeam: (team) => set({ myTeam: team }),
  setMyFantasyPicks: (picks) => set({ myFantasyPicks: picks }),
  setMyFantasyScores: (scores) => set({ myFantasyScores: scores }),
  setActiveBet: (bet) => set({ activeBet: bet }),
  setActiveSabotages: (sabotages) => set({ activeSabotages: sabotages }),
  appendChatMessage: (msg) =>
    set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  setChatMessages: (msgs) => set({ chatMessages: msgs }),
  setMatchInfo: (matchId, teamA, teamB) =>
    set({ matchId, teamAName: teamA, teamBName: teamB }),
  setLiveScore: (score, clock) => set({ liveScore: score, matchClock: clock }),
  setUnderdog: (team, multiplier) =>
    set({ underdogTeam: team, underdogMultiplier: multiplier }),
  setHandicapActive: (active) => set({ handicapActive: active }),
  setLineupPlayers: (players) => set({ lineupPlayers: players }),

  hydrateFromRoom: (room, myPlayerId) => {
    const players = (room.players as Player[]) || [];
    const pid = myPlayerId || get().playerId;
    const me = players.find((p) => p.id === pid);

    set({
      roomId: room.id as string,
      roomState: room.state as RoomState,
      players,
      settings: (room.settings as RoomSettings) || defaultSettings,
      matchId: room.match_id as string | null,
      teamAName: (room.team_a_name as string) || 'Team A',
      teamBName: (room.team_b_name as string) || 'Team B',
      underdogTeam: room.underdog_team as TeamLetter | null,
      underdogMultiplier: Number(room.underdog_multiplier) || 1.0,
      handicapActive: Boolean(room.handicap_active),
      myBalance: me?.balance ?? 1000,
      myTeam: me?.assigned_team ?? null,
    });
  },

  reset: () => set(initialState),
}));
