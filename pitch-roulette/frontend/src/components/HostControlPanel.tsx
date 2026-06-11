import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useGameStore } from '../store/gameStore';

const STATE_ORDER = ['LOBBY', 'SCOUTING', 'DRAFT_LOCKED', 'LIVE', 'FULL_TIME', 'RESULTS'] as const;

const BET_TYPES = [
  { value: 'PENALTY', label: 'Penalty', description: 'Goal / Save / Miss' },
  { value: 'PULSE', label: 'Pulse', description: 'Next goal or not' },
  { value: 'VAR_REVIEW', label: 'VAR Review', description: 'Stands or overturned' },
  { value: 'MANUAL', label: 'Manual', description: 'Custom Yes/No bet' },
] as const;

export function HostControlPanel() {
  const {
    roomCode,
    sessionToken,
    roomState,
    players,
    activeBet,
    settings,
  } = useGameStore();

  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const [betType, setBetType] = useState<(typeof BET_TYPES)[number]['value']>('PENALTY');

  const currentIdx = STATE_ORDER.indexOf(roomState);
  const nextState = currentIdx < STATE_ORDER.length - 1 ? STATE_ORDER[currentIdx + 1] : null;
  const totalChips = players.reduce((sum, p) => sum + p.balance, 0);

  const handleAdvance = async () => {
    if (!roomCode || !sessionToken || !nextState) return;
    setLoading(true);
    setError('');
    try {
      if (roomState === 'LOBBY') {
        await api.startDraft(roomCode, sessionToken);
      } else {
        await api.advanceState(roomCode, sessionToken, nextState);
      }
      setConfirming(false);
    } catch (e) {
      if (e instanceof ApiError) {
        setError((e.data.error as string) || 'Failed to advance');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualBet = async () => {
    if (!roomCode || !sessionToken) return;
    setLoading(true);
    setError('');
    try {
      const label = BET_TYPES.find((b) => b.value === betType)?.label ?? betType;
      const options = betType === 'MANUAL'
        ? {
            option_a: { label: 'Yes', multiplier: 2.0 },
            option_b: { label: 'No', multiplier: 1.5 },
          }
        : undefined;
      await api.manualFlashBet(
        roomCode,
        sessionToken,
        betType,
        `${label} — Host Triggered`,
        options,
      );
    } catch (e) {
      if (e instanceof ApiError) {
        setError((e.data.error as string) || 'Failed to trigger bet');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKick = async (playerId: string) => {
    if (!roomCode || !sessionToken) return;
    try {
      await api.kickPlayer(roomCode, sessionToken, playerId);
      setKickTarget(null);
    } catch (e) {
      if (e instanceof ApiError) {
        setError((e.data.error as string) || 'Kick failed');
      }
    }
  };

  return (
    <div className="min-h-screen bg-pitch-black p-4">
      <h1 className="mb-1 text-xl font-bold text-white">Host Control Panel</h1>
      <p className="mb-6 font-mono text-pitch-green">Room {roomCode}</p>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-pitch-border bg-pitch-card p-3 text-center">
          <p className="text-2xl font-bold text-white">{players.length}</p>
          <p className="text-xs text-pitch-muted">Players</p>
        </div>
        <div className="rounded-xl border border-pitch-border bg-pitch-card p-3 text-center">
          <p className="text-2xl font-bold text-pitch-green">{totalChips}</p>
          <p className="text-xs text-pitch-muted">Chips in Play</p>
        </div>
        <div className="rounded-xl border border-pitch-border bg-pitch-card p-3 text-center">
          <p className="text-2xl font-bold text-pitch-amber">{activeBet ? '1' : '0'}</p>
          <p className="text-xs text-pitch-muted">Active Bets</p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-pitch-border bg-pitch-card p-4">
        <p className="mb-1 text-sm text-pitch-muted">Current State</p>
        <p className="text-lg font-bold text-pitch-green">{roomState}</p>
        {nextState && (
          <p className="mt-1 text-sm text-pitch-muted">Next: {nextState}</p>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-pitch-red">{error}</p>}

      {nextState && (
        <div className="mb-4">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="w-full rounded-xl bg-pitch-green py-3 font-bold text-pitch-black"
            >
              Advance to {nextState}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-center text-sm text-pitch-amber">
                Confirm advancing to {nextState}?
              </p>
              <button
                onClick={handleAdvance}
                disabled={loading}
                className="w-full rounded-xl bg-pitch-green py-3 font-bold text-pitch-black disabled:opacity-50"
              >
                {loading ? 'Advancing...' : 'Confirm'}
              </button>
              <button onClick={() => setConfirming(false)} className="w-full text-sm text-pitch-muted">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {settings.module_flash_bets && roomState === 'LIVE' && (
        <div className="mb-6 space-y-3">
          <label htmlFor="bet-type" className="block text-sm text-pitch-muted">
            Flash bet type
          </label>
          <select
            id="bet-type"
            value={betType}
            onChange={(e) => setBetType(e.target.value as typeof betType)}
            className="min-h-[44px] w-full rounded-xl border border-pitch-border bg-pitch-dark px-3 text-white"
          >
            {BET_TYPES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label} — {b.description}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleManualBet}
            disabled={loading}
            className="min-h-[44px] w-full rounded-xl border border-pitch-amber py-3 text-pitch-amber disabled:opacity-50"
          >
            Trigger {BET_TYPES.find((b) => b.value === betType)?.label} Flash Bet
          </button>
        </div>
      )}

      <div className="rounded-xl border border-pitch-border bg-pitch-card p-4">
        <h3 className="mb-3 font-medium text-white">Players</h3>
        <div className="space-y-2">
          {players.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg bg-pitch-dark p-3">
              <div>
                <span className="text-white">{p.nickname}</span>
                {p.is_host && <span className="ml-2 text-xs text-pitch-amber">HOST</span>}
                <p className="text-xs text-pitch-muted">{p.balance} PC · Team {p.assigned_team || '—'}</p>
              </div>
              {!p.is_host && (
                kickTarget === p.id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleKick(p.id)}
                      className="rounded bg-pitch-red px-2 py-1 text-xs text-white"
                    >
                      Confirm
                    </button>
                    <button onClick={() => setKickTarget(null)} className="text-xs text-pitch-muted">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setKickTarget(p.id)}
                    className="text-xs text-pitch-red"
                  >
                    Kick
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
