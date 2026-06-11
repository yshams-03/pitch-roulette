import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import type { LineupPlayer } from '../../../shared/types';

const FORMATION_POSITIONS: Record<string, { x: number; y: number }[]> = {
  '4-3-3': [
    { x: 50, y: 88 }, { x: 20, y: 70 }, { x: 40, y: 72 }, { x: 60, y: 72 }, { x: 80, y: 70 },
    { x: 30, y: 50 }, { x: 50, y: 48 }, { x: 70, y: 50 },
    { x: 25, y: 25 }, { x: 50, y: 20 }, { x: 75, y: 25 },
  ],
  default: [
    { x: 50, y: 88 },
    { x: 15, y: 70 }, { x: 35, y: 72 }, { x: 65, y: 72 }, { x: 85, y: 70 },
    { x: 25, y: 50 }, { x: 50, y: 48 }, { x: 75, y: 50 },
    { x: 20, y: 25 }, { x: 50, y: 18 }, { x: 80, y: 25 },
  ],
};

interface Props {
  lineups?: Array<{ team: string; formation: string; players: LineupPlayer[]; teamIndex?: number }>;
  blindfolded?: boolean;
  handicapActive?: boolean;
  handicapTeam?: 'A' | 'B' | null;
  teamAName?: string;
  teamBName?: string;
}

export function ScoutingHub({ lineups, blindfolded, handicapActive, handicapTeam, teamAName, teamBName }: Props) {
  const store = useGameStore();
  const aName = teamAName || store.teamAName;
  const bName = teamBName || store.teamBName;
  const myTeam = store.myTeam;
  const myTeamName = myTeam === 'A' ? aName : bName;
  const myLineupIndex = lineups?.findIndex((l) => l.team === myTeamName) ?? (myTeam === 'A' ? 0 : 1);
  const [selectedPlayer, setSelectedPlayer] = useState<LineupPlayer | null>(null);

  const lineup = lineups?.[myLineupIndex >= 0 ? myLineupIndex : 0];
  const positions = FORMATION_POSITIONS[lineup?.formation || 'default'] || FORMATION_POSITIONS.default;
  const showHandicap = handicapActive && handicapTeam === myTeam;

  return (
    <div className={`relative ${blindfolded ? 'blur-md pointer-events-none select-none' : ''}`}>
      <div className="mb-3 flex items-center justify-between rounded-lg border border-pitch-border bg-pitch-card px-3 py-2">
        <span className="text-sm font-medium text-white">{lineup?.team || myTeamName || 'Your squad'}</span>
        {showHandicap && (
          <span className="rounded-full bg-pitch-amber/20 px-2 py-1 text-xs text-pitch-amber">⚖️ Handicap</span>
        )}
      </div>

      <svg viewBox="0 0 100 100" className="w-full rounded-xl border border-pitch-border bg-pitch-green/10">
        <rect x="2" y="2" width="96" height="96" fill="#1a3d1a" rx="2" />
        <line x1="2" y1="50" x2="98" y2="50" stroke="#39FF14" strokeWidth="0.3" opacity="0.5" />
        <circle cx="50" cy="50" r="8" fill="none" stroke="#39FF14" strokeWidth="0.3" opacity="0.5" />
        <rect x="25" y="2" width="50" height="16" fill="none" stroke="#39FF14" strokeWidth="0.3" opacity="0.5" />
        <rect x="25" y="82" width="50" height="16" fill="none" stroke="#39FF14" strokeWidth="0.3" opacity="0.5" />

        {lineup?.players.map((player, i) => {
          const pos = positions[i] || { x: 50, y: 50 };
          return (
            <g
              key={player.id || i}
              onClick={() => setSelectedPlayer(player)}
              className="cursor-pointer"
              role="button"
              aria-label={`${player.name}, ${player.pos}`}
            >
              <circle cx={pos.x} cy={pos.y} r="5" fill="#39FF14" opacity="0.9" />
              {showHandicap && (
                <text x={pos.x + 4} y={pos.y - 4} fontSize="3" fill="#F5A623">⚖️</text>
              )}
              <text x={pos.x} y={pos.y + 0.8} textAnchor="middle" fontSize="2.5" fill="#0D0D0F" fontWeight="bold">
                {player.number || i + 1}
              </text>
            </g>
          );
        })}
      </svg>

      <AnimatePresence>
        {selectedPlayer && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-pitch-border bg-pitch-card p-6"
            role="dialog"
            aria-label="Player profile"
          >
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-pitch-border" />
            <h3 className="text-lg font-bold text-white">{selectedPlayer.name}</h3>
            <p className="text-sm text-pitch-muted">
              #{selectedPlayer.number} · {selectedPlayer.pos}
            </p>
            {showHandicap && (
              <p className="mt-1 text-sm text-pitch-amber">⚖️ Handicap team — +0.5 fantasy bonus</p>
            )}
            <p className="mt-2 text-xs text-pitch-muted">
              Threat Index: {(selectedPlayer.number % 5 + 6).toFixed(1)} · Role Profile: {selectedPlayer.pos}
            </p>
            <p className="mt-1 text-xs text-pitch-muted">
              Stat triggers: Goals +3 · Assists +2 · Cards −1 · Rating &lt;6.0 −1
            </p>
            <button
              type="button"
              onClick={() => setSelectedPlayer(null)}
              className="mt-4 min-h-[44px] w-full rounded-xl bg-pitch-border py-3 text-sm text-white"
            >
              Close
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {blindfolded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-pitch-black/80 px-4 py-2 text-sm text-pitch-amber">
            Blindfolded — scouting disabled
          </span>
        </div>
      )}
    </div>
  );
}
