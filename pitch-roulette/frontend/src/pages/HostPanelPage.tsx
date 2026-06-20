import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { snapshotFromApi } from '../lib/roomSnapshot';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/Avatar';
import { useRoomRealtime } from '../hooks/useRoomRealtime';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { isSimulationRoom } from '../lib/roomUtils';
import type { FlashBet, RoomPlayer, RoomState, Sabotage } from '../../../shared/types';

const PRESETS: { question: string; options: string[] }[] = [
  { question: 'Next corner leads to a shot on target?', options: ['Yes', 'No'] },
  { question: 'VAR review — penalty given?', options: ['Penalty', 'No penalty'] },
  { question: 'Free kick results in a goal?', options: ['Goal', 'No goal'] },
  { question: 'Penalty scored?', options: ['Scored', 'Missed'] },
  { question: 'Sub makes an impact before FT?', options: ['Yes', 'No'] },
];

export function HostPanelPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, userId } = useAuthStore();
  const flags = useFeatureFlags();
  const { room, players, refresh, applySnapshot, patchRoom } = useRoomRealtime(code);
  const [bets, setBets] = useState<FlashBet[]>([]);
  const [customQ, setCustomQ] = useState('');
  const [customOpts, setCustomOpts] = useState(['Yes', 'No']);
  const [wagerTier, setWagerTier] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [resolveOpt, setResolveOpt] = useState('');
  const [roomSabotages, setRoomSabotages] = useState<Sabotage[]>([]);
  const [transitioning, setTransitioning] = useState(false);

  const isHost = room?.host_id === userId;
  const simRoom = isSimulationRoom(room);

  useEffect(() => {
    if (!code || !session) return;
    api.flashBets(code).then((r) => setBets((r.bets as unknown as FlashBet[]) || [])).catch(() => {});
    api.listSabotages(session.access_token, code).then((r) => {
      setRoomSabotages((r.room_active as Sabotage[]) || []);
    }).catch(() => {});
  }, [code, room?.state, session]);

  const activeBet = useMemo(
    () => bets.find((b) => b.state === 'OPEN' || b.state === 'LOCKED'),
    [bets],
  );

  const loadBets = () => {
    if (!code) return;
    api.flashBets(code).then((r) => setBets((r.bets as unknown as FlashBet[]) || []));
  };

  const guard = () => {
    if (!session || !code) return false;
    if (!isHost) {
      toast.error('Only the host can use this panel');
      return false;
    }
    return true;
  };

  const transitionRoom = async (
    call: () => Promise<Record<string, unknown>>,
    newState: RoomState,
    redirectPath?: string,
    successMsg?: string,
  ) => {
    if (!guard()) return;
    setTransitioning(true);
    patchRoom({ state: newState });
    try {
      const res = await call();
      const snap = snapshotFromApi(res);
      if (snap) applySnapshot(snap);
      if (successMsg) toast.success(successMsg);
      if (redirectPath) navigate(redirectPath);
    } catch (e) {
      refresh();
      toast.error(e instanceof Error ? e.message : 'Transition failed');
    } finally {
      setTransitioning(false);
    }
  };

  const startPredictions = () =>
    transitionRoom(
      () => api.startRoom(session!.access_token, code!),
      'PREDICTING',
      `/room/${code}/predict`,
      'Predictions started',
    );

  const lockPredictions = () =>
    transitionRoom(
      () => api.lockRoom(session!.access_token, code!),
      'CLOSED',
      undefined,
      'Predictions locked',
    );

  const startDraft = () =>
    transitionRoom(
      () => api.startDraft(session!.access_token, code!),
      'DRAFTING',
      `/room/${code}/draft`,
      'Draft started',
    );

  const goLive = () =>
    transitionRoom(
      () => api.goLive(session!.access_token, code!),
      'LIVE',
      `/room/${code}/live`,
      'Room is live',
    );

  const endMatch = () =>
    transitionRoom(
      () => api.endMatch(session!.access_token, code!),
      'RESULTS',
      `/room/${code}/results`,
      'Match ended',
    );

  const launchPreset = async (preset: typeof PRESETS[0]) => {
    if (!guard()) return;
    await api.createFlashBet(session!.access_token, code!, {
      question: preset.question,
      options: preset.options,
      wager_tier: wagerTier,
    });
    toast.success('Flash bet launched');
    loadBets();
  };

  const launchCustom = async () => {
    if (!guard()) return;
    const opts = customOpts.map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) {
      toast.error('Need at least 2 options');
      return;
    }
    await api.createFlashBet(session!.access_token, code!, {
      question: customQ.trim(),
      options: opts,
      wager_tier: wagerTier,
    });
    toast.success('Flash bet launched');
    setCustomQ('');
    loadBets();
  };

  const resolve = async () => {
    if (!guard() || !activeBet || !resolveOpt) return;
    await api.resolveFlashBet(session!.access_token, code!, activeBet.id, resolveOpt);
    toast.success('Resolved — PP awarded');
    setResolveOpt('');
    loadBets();
    refresh();
  };

  const fastForward = async () => {
    if (!guard()) return;
    try {
      await api.fastForward(session!.access_token, code!);
      toast.success('Next event triggered');
      loadBets();
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not fast-forward');
    }
  };

  const kick = async (uid: string) => {
    if (!guard()) return;
    await api.kickPlayer(session!.access_token, code!, uid);
    toast.success('Player removed');
    refresh();
  };

  const makeHost = async (uid: string) => {
    if (!guard()) return;
    if (!window.confirm('Transfer host role to this player?')) return;
    try {
      await api.transferHost(session!.access_token, code!, uid);
      toast.success('Host transferred');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transfer failed');
    }
  };

  const toggleChat = async (enabled: boolean) => {
    if (!guard()) return;
    await api.toggleChat(session!.access_token, code!, enabled);
    refresh();
  };

  if (!room) return <div className="p-8 text-pitch-muted">Loading host panel...</div>;

  if (!isHost) {
    return (
      <div className="px-4 py-8 max-w-lg mx-auto text-center">
        <p className="text-pitch-amber mb-4">Host access only</p>
        <Link to={`/room/${code}/live`} className="text-pitch-green">Back to room</Link>
      </div>
    );
  }

  const match = room.match_data;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto pb-12">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-white">Host panel</h1>
        <span className="font-mono text-pitch-green">{room.room_code}</span>
      </div>

      {match && (
        <div className="ui-surface p-3 mb-4 text-center">
          <p className="text-sm text-white">{match.home_team} vs {match.away_team}</p>
          <p className="text-2xl font-mono text-pitch-green mt-1">
            {match.home_goals} – {match.away_goals}
          </p>
          {match.is_live && <p className="text-xs text-red-400">LIVE {match.minute}&apos;</p>}
        </div>
      )}

      <section className="mb-6">
        <h2 className="text-xs text-pitch-muted uppercase mb-2">Phase</h2>
        <div className="grid gap-2">
          {room.state === 'LOBBY' && (
            <button type="button" onClick={startPredictions} disabled={transitioning} className="ui-btn ui-btn-primary w-full">
              {transitioning ? 'Starting…' : 'Start predictions'}
            </button>
          )}
          {room.state === 'PREDICTING' && (
            <button type="button" onClick={lockPredictions} disabled={transitioning} className="ui-btn w-full border border-pitch-amber text-pitch-amber">
              {transitioning ? 'Locking…' : 'Lock predictions'}
            </button>
          )}
          {room.state === 'CLOSED' && (
            <>
              {flags.fantasy_draft && (
                <button type="button" onClick={startDraft} disabled={transitioning} className="ui-btn ui-btn-primary w-full">
                  {transitioning ? 'Starting draft…' : 'Start draft'}
                </button>
              )}
              <button type="button" onClick={goLive} disabled={transitioning} className="ui-btn w-full border border-pitch-muted text-pitch-muted">
                {transitioning ? 'Going live…' : flags.fantasy_draft ? 'Skip draft / Go live' : 'Go live'}
              </button>
            </>
          )}
          {room.state === 'DRAFTING' && (
            <button type="button" onClick={goLive} disabled={transitioning} className="ui-btn ui-btn-primary w-full">
              {transitioning ? 'Going live…' : 'Go live'}
            </button>
          )}
          {(room.state === 'LIVE' || room.state === 'FULL_TIME') && (
            <button type="button" onClick={endMatch} disabled={transitioning} className="ui-btn w-full border border-pitch-amber text-pitch-amber">
              {transitioning ? 'Ending…' : 'End match'}
            </button>
          )}
        </div>
        <p className="text-xs text-pitch-muted mt-2">State: {room.state}</p>
      </section>

      {room.state === 'LIVE' && flags.flash_bets && (
        <section className="mb-6">
          <h2 className="text-xs text-pitch-muted uppercase mb-2">Flash bets</h2>

          {simRoom && (
            <button
              type="button"
              data-testid="inject-event-btn"
              onClick={fastForward}
              className="ui-btn w-full mb-3 border border-pitch-green text-pitch-green"
            >
              Fast-forward next event
            </button>
          )}

          <div className="flex gap-2 mb-3">
            {(['LOW', 'MEDIUM', 'HIGH'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setWagerTier(t)}
                className={`ui-btn flex-1 text-xs ${wagerTier === t ? 'ui-btn-primary' : ''}`}
              >
                {t}
              </button>
            ))}
          </div>

          {activeBet && (
            <div className="ui-surface p-3 mb-3 border border-pitch-amber">
              <p className="text-sm text-white mb-2">Active: {activeBet.question}</p>
              {activeBet.answer_key && (
                <p className="text-xs text-pitch-muted mb-2 font-mono">
                  Resolve key: {activeBet.answer_key}
                  {activeBet.match_minute != null ? ` · min ${activeBet.match_minute}` : ''}
                </p>
              )}
              <select
                value={resolveOpt}
                onChange={(e) => setResolveOpt(e.target.value)}
                className="w-full min-h-9 rounded-lg bg-pitch-card border border-pitch-border text-white text-sm mb-2"
              >
                <option value="">Pick correct answer…</option>
                {activeBet.options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <button type="button" onClick={resolve} disabled={!resolveOpt} data-testid="resolve-flash-bet-btn" className="ui-btn ui-btn-primary w-full">
                Resolve & award PP
              </button>
            </div>
          )}

          <div className="space-y-2 mb-4">
            {PRESETS.map((p, idx) => (
              <button
                key={p.question}
                type="button"
                data-testid={idx === 0 ? 'create-flash-bet-btn' : undefined}
                onClick={() => launchPreset(p)}
                className="ui-btn w-full text-left text-sm"
              >
                {p.question}
              </button>
            ))}
          </div>

          <div className="ui-surface p-3 space-y-2">
            <p className="text-xs text-pitch-muted">Custom bet</p>
            <input
              value={customQ}
              onChange={(e) => setCustomQ(e.target.value)}
              placeholder="Question"
              className="w-full min-h-9 rounded-lg bg-pitch-card border border-pitch-border px-2 text-sm text-white"
            />
            {customOpts.map((opt, i) => (
              <input
                key={i}
                value={opt}
                onChange={(e) => {
                  const next = [...customOpts];
                  next[i] = e.target.value;
                  setCustomOpts(next);
                }}
                placeholder={`Option ${i + 1}`}
                className="w-full min-h-9 rounded-lg bg-pitch-card border border-pitch-border px-2 text-sm text-white"
              />
            ))}
            {customOpts.length < 4 && (
              <button
                type="button"
                onClick={() => setCustomOpts([...customOpts, ''])}
                className="text-xs text-pitch-muted"
              >
                + Add option
              </button>
            )}
            <button type="button" onClick={launchCustom} data-testid="create-flash-bet-custom-btn" className="ui-btn ui-btn-primary w-full">
              Launch custom bet
            </button>
          </div>
        </section>
      )}

      <section className="mb-6">
        <h2 className="text-xs text-pitch-muted uppercase mb-2">Active sabotages</h2>
        {roomSabotages.length === 0 ? (
          <p className="text-xs text-pitch-muted">None active</p>
        ) : (
          <div className="space-y-1">
            {roomSabotages.map((s) => {
              const target = players.find((p) => p.user_id === s.target_id);
              const buyer = players.find((p) => p.user_id === s.buyer_id);
              return (
                <p key={s.id} className="text-xs text-white ui-surface p-2">
                  {s.emoji || '💣'} {buyer?.display_name || '?'} → {target?.display_name || '?'} ({s.label || s.sabotage_type})
                </p>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="text-xs text-pitch-muted uppercase mb-2">Players</h2>
        <div className="space-y-2">
          {players.map((p: RoomPlayer) => (
            <div key={p.user_id} className="flex items-center gap-2 ui-surface p-2">
              <Avatar name={p.display_name || '?'} color={p.avatar_color} size="sm" />
              <span className="text-sm text-white flex-1">{p.display_name}</span>
              {!p.is_host && (
                <>
                  <button
                    type="button"
                    data-testid={`transfer-host-${p.user_id}`}
                    onClick={() => makeHost(p.user_id)}
                    className="text-xs text-pitch-green mr-2"
                  >
                    Make host
                  </button>
                  <button
                    type="button"
                    data-testid={`kick-player-${p.user_id}`}
                    onClick={() => kick(p.user_id)}
                    className="text-xs text-red-400"
                  >
                    Kick
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs text-pitch-muted uppercase mb-2">Chat</h2>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="chat-toggle-on"
            onClick={() => toggleChat(true)}
            className={`ui-btn flex-1 ${room.chat_enabled !== false ? 'ui-btn-primary' : ''}`}
          >
            On
          </button>
          <button
            type="button"
            data-testid="chat-toggle-off"
            onClick={() => toggleChat(false)}
            className={`ui-btn flex-1 ${room.chat_enabled === false ? 'ui-btn-primary' : ''}`}
          >
            Off
          </button>
        </div>
      </section>

      <Link to={`/room/${code}/live`} className="block text-center text-sm text-pitch-green mt-8">
        ← Back to live room
      </Link>
    </div>
  );
}
