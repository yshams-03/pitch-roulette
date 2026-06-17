import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../store/authStore';

const STEPS = [
  { n: 1, title: 'Enter the room', detail: 'Join the lobby with Alex, Sam & Jordan (bots).' },
  { n: 2, title: 'Predict the score', detail: 'Lock your France vs Netherlands prediction before kickoff.' },
  { n: 3, title: 'Start the match', detail: 'Lock predictions, then tap Go live.' },
  { n: 4, title: 'Live flash bets', detail: 'Events fire every ~18s. Answer flash bets; use Host panel → Fast-forward to skip ahead.' },
];

/** Thin launcher — creates a simulation room via the unified rooms API. */
export function DemoSandboxPage() {
  const navigate = useNavigate();
  const { session } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const start = async () => {
    if (!session) {
      toast.error('Log in first');
      return;
    }
    setLoading(true);
    try {
      let room: Record<string, unknown>;
      try {
        room = await api.createRoom(session.access_token, {
          match_source: 'demo_simulation',
          bot_config: { enabled: true, count: 3, difficulty: 'medium' },
          phase: 'LOBBY',
        });
      } catch (e) {
        const legacyNeeded =
          e instanceof ApiError && (e.status === 422 || e.status === 400);
        if (!legacyNeeded) throw e;
        const legacy = await api.demoStart(session.access_token, 'LOBBY');
        room = legacy.room;
      }
      const code = room.room_code as string;
      toast.success(`Demo room ${code} — predict your score!`);
      navigate(`/room/${code}/lobby`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start demo');
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="px-4 py-10 max-w-lg mx-auto text-center">
        <h1 className="text-xl font-bold text-white mb-2">Demo match</h1>
        <p className="text-pitch-muted mb-4">Log in to play through a full mock World Cup room.</p>
        <Link to="/auth/login" className="text-pitch-green">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto pb-24">
      <h1 className="text-xl font-bold text-white mb-1">Demo match</h1>
      <p className="text-sm text-pitch-muted mb-6">
        France vs Netherlands — play the full flow: lobby, predict, go live, flash bets.
      </p>

      <div className="ui-surface p-4 mb-6 space-y-4">
        {STEPS.map((s) => (
          <div key={s.n} className="flex gap-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-pitch-green text-pitch-black text-sm font-bold flex items-center justify-center">
              {s.n}
            </span>
            <div>
              <p className="text-sm font-semibold text-white">{s.title}</p>
              <p className="text-xs text-pitch-muted mt-0.5">{s.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={start}
        className="ui-btn ui-btn-primary w-full mb-3"
      >
        {loading ? 'Creating room…' : 'Enter demo match'}
      </button>

      <p className="text-xs text-center text-pitch-muted">
        You are the host. Bots submit predictions and answer flash bets; match events are injected automatically once live.
      </p>
    </div>
  );
}
