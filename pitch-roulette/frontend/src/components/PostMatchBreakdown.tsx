import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toPng } from 'html-to-image';
import { Download, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import { useGameStore } from '../store/gameStore';
import { saveSession } from '../lib/session';

interface Props {
  onRematch?: (newCode: string, hostToken: string) => void;
}

export function PostMatchBreakdown({ onRematch }: Props) {
  const { players, teamAName, teamBName, liveScore, roomCode, sessionToken, isHost } = useGameStore();
  const cardRef = useRef<HTMLDivElement>(null);
  const [voted, setVoted] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);

  const sorted = [...players].sort((a, b) => b.balance - a.balance);

  if (players.length === 0) {
    return (
      <div className="space-y-4 p-4">
        <div className="mx-auto h-8 w-48 animate-pulse rounded bg-pitch-card" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-pitch-card" />
        ))}
      </div>
    );
  }

  const handleShare = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `pitch-roulette-${roomCode}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // export failed silently
    }
  };

  const handleRematch = async () => {
    if (!sessionToken || !roomCode || !isHost) return;
    setRematching(true);
    try {
      const result = await api.rematch(roomCode, sessionToken);
      saveSession({
        sessionToken: result.host_token,
        playerId: useGameStore.getState().playerId!,
        roomCode: result.code,
        isHost: true,
      });
      onRematch?.(result.code, result.host_token);
    } finally {
      setRematching(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Full Time!</h2>
        <p className="font-mono text-lg text-pitch-green">
          {teamAName} {liveScore.a} - {liveScore.b} {teamBName}
        </p>
      </div>

      <div ref={cardRef} className="rounded-xl border border-pitch-border bg-pitch-card p-4">
        <h3 className="mb-4 text-center text-sm uppercase tracking-wider text-pitch-muted">
          Final Standings
        </h3>
        <div className="space-y-3">
          {sorted.map((player, i) => (
            <motion.div
              key={player.id}
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.15 }}
              className="flex items-center justify-between rounded-lg bg-pitch-dark p-3"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-pitch-muted">#{i + 1}</span>
                {i === 0 && <span>👑</span>}
                {i === sorted.length - 1 && sorted.length > 1 && <span>⚰️</span>}
                <span className="font-medium text-white">{player.nickname}</span>
                {player.assigned_team && (
                  <span className="text-xs text-pitch-muted">Team {player.assigned_team}</span>
                )}
              </div>
              <span className="font-mono font-bold text-pitch-green">{player.balance} PC</span>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-pitch-border bg-pitch-card p-4">
        <h3 className="mb-3 text-sm font-medium text-white">Moment of the Match</h3>
        <div className="flex flex-wrap gap-2">
          {['Best Goal', 'Best Save', 'Funniest Moment', 'Biggest Upset'].map((option) => (
            <button
              key={option}
              onClick={() => setVoted(option)}
              className={`rounded-full px-3 py-1 text-xs ${
                voted === option
                  ? 'bg-pitch-green text-pitch-black'
                  : 'bg-pitch-dark text-pitch-muted border border-pitch-border'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        {voted && <p className="mt-2 text-xs text-pitch-muted">You voted: {voted}</p>}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleShare}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-pitch-border py-3 text-sm text-white"
        >
          <Download className="h-4 w-4" />
          Share Card
        </button>
        {isHost && (
          <button
            onClick={handleRematch}
            disabled={rematching}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-pitch-green py-3 text-sm font-bold text-pitch-black disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            {rematching ? 'Creating...' : 'Rematch'}
          </button>
        )}
      </div>
    </div>
  );
}
