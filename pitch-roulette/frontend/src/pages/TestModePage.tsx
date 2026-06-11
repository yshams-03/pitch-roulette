import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';
import { saveSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../store/gameStore';
import type { Player, RoomState, SabotageType } from '../../../shared/types';

interface ScenarioState {
  active: boolean;
  room_code?: string;
  room_id?: string;
  room_state?: RoomState;
  real_player_token?: string;
  events_fired?: number;
  events_remaining?: number;
  score_a?: number;
  score_b?: number;
  match_minute?: number;
  last_event?: string;
  running?: boolean;
  speed?: number;
  next_events?: Array<{ type: string; delay_seconds: number; description: string }>;
  score_predictions?: Record<string, { score_a: number; score_b: number }>;
}

const STEPS = [
  { key: 'LOBBY', label: '1. Random team assignment' },
  { key: 'SCOUTING', label: '2. Switch team + predict score' },
  { key: 'DRAFT_LOCKED', label: '3. Fantasy — pick 11 players' },
  { key: 'LIVE', label: '4. Live — flash bets + sabotage' },
];

const SABOTAGE_TYPES: SabotageType[] = ['BLINDFOLD', 'TAX_COLLECTOR', 'CHAT_SILENCER', 'JINX', 'MIRROR'];

export function TestModePage() {
  const { setSession, hydrateFromRoom, playerId } = useGameStore();
  const [nickname, setNickname] = useState('Yassin');
  const [loading, setLoading] = useState(false);
  const [session, setLocalSession] = useState<Record<string, unknown> | null>(null);
  const [scenario, setScenario] = useState<ScenarioState>({ active: false });
  const [players, setPlayers] = useState<Player[]>([]);
  const [sabotages, setSabotages] = useState<Record<string, unknown>[]>([]);
  const [speed, setSpeed] = useState(5);
  const [predA, setPredA] = useState('1');
  const [predB, setPredB] = useState('2');
  const [sabotageTarget, setSabotageTarget] = useState('');
  const [sabotageType, setSabotageType] = useState<SabotageType>('BLINDFOLD');

  const roomId = scenario.room_id;
  const roomCode = scenario.room_code;
  const myToken = scenario.real_player_token;
  const myId = (session?.real_player_id as string) || playerId;
  const roomState = scenario.room_state || 'LOBBY';

  const refreshScenario = useCallback(async () => {
    try {
      const state = await api.testScenarioState();
      setScenario(state as ScenarioState);
    } catch {
      setScenario({ active: false });
    }
  }, []);

  const refreshRoomData = useCallback(async () => {
    if (!roomId || !roomCode) return;
    try {
      const room = await api.getRoom(roomCode);
      setPlayers((room.players as Player[]) || []);
      if (myId) hydrateFromRoom(room, myId);
    } catch {
      /* ignore */
    }
    if (supabase && roomId) {
      const sab = await supabase.from('sabotages').select('*').eq('room_id', roomId).eq('active', true);
      setSabotages(sab.data || []);
    }
  }, [roomId, roomCode, myId, hydrateFromRoom]);

  useEffect(() => { refreshScenario(); }, [refreshScenario]);

  useEffect(() => {
    if (!scenario.active) return;
    refreshRoomData();
    const t = setInterval(() => { refreshScenario(); refreshRoomData(); }, 3000);
    return () => clearInterval(t);
  }, [scenario.active, refreshScenario, refreshRoomData]);

  const handleQuickStart = async () => {
    setLoading(true);
    try {
      const result = await api.testQuickStart(nickname.trim() || 'Yassin');
      setLocalSession(result);
      setScenario({ active: true, ...result, room_state: result.state as RoomState } as ScenarioState);
      saveSession({
        sessionToken: result.real_player_token as string,
        playerId: result.real_player_id as string,
        roomCode: result.room_code as string,
        isHost: true,
      });
      setSession(result.real_player_token as string, result.real_player_id as string, result.room_code as string, true);
      const room = await api.getRoom(result.room_code as string);
      hydrateFromRoom(room, result.real_player_id as string);
      toast.success(String(result.message || 'Match is LIVE — open Live tab and Run Full Auto'));
    } catch (e) {
      toast.error(e instanceof ApiError ? String(e.data.detail || e.data.error || e.message) : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setLoading(true);
    try {
      const result = await api.testCreateSession(nickname.trim() || 'Yassin');
      setLocalSession(result);
      setScenario({ active: true, ...result } as ScenarioState);
      saveSession({
        sessionToken: result.real_player_token as string,
        playerId: result.real_player_id as string,
        roomCode: result.room_code as string,
        isHost: true,
      });
      setSession(result.real_player_token as string, result.real_player_id as string, result.room_code as string, true);
      const room = await api.getRoom(result.room_code as string);
      hydrateFromRoom(room, result.real_player_id as string);
      toast.success('Test session created — follow the steps below');
    } catch (e) {
      toast.error(e instanceof ApiError ? String(e.data.error || e.message) : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const myPlayer = players.find((p) => p.id === myId);
  const botPlayers = players.filter((p) => p.id !== myId);
  const stepIndex = STEPS.findIndex((s) => s.key === roomState);
  const currentStep = stepIndex >= 0 ? stepIndex : (roomState === 'FULL_TIME' || roomState === 'RESULTS' ? 4 : 0);

  return (
    <div className="min-h-screen bg-pitch-black text-white p-4 max-w-4xl mx-auto font-sans pb-24">
      <header className="mb-6 border-b border-pitch-border pb-4">
        <h1 className="text-2xl font-bold text-pitch-green">Egypt vs Belgium — Test Mode</h1>
        <p className="text-pitch-muted text-sm mt-1">Full storyline: teams → predict → fantasy 11 → live bets → sabotage</p>
      </header>

      {!scenario.active ? (
        <section className="bg-pitch-card border border-pitch-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold">Start Egypt vs Belgium test</h2>
          <p className="text-sm text-pitch-muted">
            Use <span className="text-pitch-green">Quick Start</span> to skip setup and jump straight to LIVE
            (teams, predictions, fantasy picks done for you).
          </p>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Nickname"
            className="w-full bg-pitch-dark border border-pitch-border rounded-lg px-3 py-2"
          />
          <button type="button" onClick={handleQuickStart} disabled={loading}
            className="w-full bg-pitch-green text-pitch-black font-bold py-3 rounded-lg disabled:opacity-50">
            {loading ? 'Starting...' : 'Quick Start Match (recommended)'}
          </button>
          <button type="button" onClick={handleCreate} disabled={loading}
            className="w-full border border-pitch-border py-2 rounded-lg text-sm text-pitch-muted hover:border-pitch-green">
            Manual setup (step-by-step)
          </button>
        </section>
      ) : (
        <div className="space-y-4">
          {/* Flow checklist */}
          <section className="bg-pitch-card border border-pitch-border rounded-xl p-4">
            <p className="text-sm text-pitch-muted mb-3">Storyline · Room <span className="font-mono text-pitch-green">{roomCode}</span> · {roomState}</p>
            <ol className="space-y-2">
              {STEPS.map((step, i) => (
                <li key={step.key} className={`text-sm flex items-center gap-2 ${i <= currentStep ? 'text-white' : 'text-pitch-muted'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${i < currentStep ? 'bg-pitch-green text-pitch-black' : i === currentStep ? 'border border-pitch-green text-pitch-green' : 'border border-pitch-border'}`}>
                    {i < currentStep ? '✓' : i + 1}
                  </span>
                  {step.label}
                </li>
              ))}
            </ol>
          </section>

          {/* Step action buttons */}
          <section className="bg-pitch-card border border-pitch-border rounded-xl p-4 space-y-2">
            <h3 className="font-semibold mb-2">Phase controls</h3>
            <p className="text-xs text-pitch-muted mb-2">
              Stuck? Use <button type="button" className="text-pitch-green underline" onClick={handleQuickStart}>Quick Start</button> or
              Go Live — it auto-advances from any phase.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" disabled={!['LOBBY'].includes(roomState)} onClick={async () => {
                try {
                  const r = await api.testStartDraft();
                  toast.success(r.message);
                  refreshScenario(); refreshRoomData();
                } catch (e) { toast.error(e instanceof ApiError ? String(e.data.detail || e.message) : 'Failed'); }
              }} className="px-3 py-2 rounded-lg border border-pitch-green text-pitch-green disabled:opacity-40 text-sm">
                Start Draft (random teams)
              </button>

              <Link to={`/room/${roomCode}/scouting`} className="px-3 py-2 rounded-lg border border-pitch-border text-center text-sm hover:border-pitch-green">
                Open Scouting (switch team)
              </Link>

              <button type="button" disabled={!['SCOUTING'].includes(roomState)} onClick={async () => {
                try {
                  const r = await api.testLockFantasy();
                  toast.success(r.message);
                  refreshScenario();
                } catch (e) { toast.error(e instanceof ApiError ? String(e.data.detail || e.message) : 'Failed'); }
              }} className="px-3 py-2 rounded-lg border border-pitch-amber text-pitch-amber disabled:opacity-40 text-sm">
                Lock Fantasy Phase
              </button>

              <Link to={`/room/${roomCode}/draft`} className="px-3 py-2 rounded-lg border border-pitch-border text-center text-sm hover:border-pitch-green">
                Pick 11 Fantasy Players
              </Link>

              <button type="button" disabled={roomState === 'LIVE' || roomState === 'RESULTS'} onClick={async () => {
                try {
                  const r = await api.testGoLive();
                  toast.success(`Match live — ${r.state}`);
                  refreshScenario(); refreshRoomData();
                } catch (e) { toast.error(e instanceof ApiError ? String(e.data.detail || e.message) : 'Failed'); }
              }} className="px-3 py-2 rounded-lg bg-pitch-green text-pitch-black font-semibold disabled:opacity-40 text-sm">
                Go Live (auto-advance)
              </button>

              <Link to={`/room/${roomCode}/live`} target="_blank" className="px-3 py-2 rounded-lg border border-pitch-green text-pitch-green text-center text-sm">
                Open Live Game tab
              </Link>
            </div>
          </section>

          {/* Score prediction (step 2) */}
          {roomState === 'SCOUTING' && myToken && (
            <section className="bg-pitch-card border border-pitch-border rounded-xl p-4">
              <h3 className="font-semibold text-pitch-amber mb-2">Predict final score</h3>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">Egypt</span>
                <input type="number" min={0} max={20} value={predA} onChange={(e) => setPredA(e.target.value)}
                  className="w-14 bg-pitch-dark border border-pitch-border rounded px-2 py-1 text-center" />
                <span>–</span>
                <input type="number" min={0} max={20} value={predB} onChange={(e) => setPredB(e.target.value)}
                  className="w-14 bg-pitch-dark border border-pitch-border rounded px-2 py-1 text-center" />
                <span className="text-sm">Belgium</span>
              </div>
              <button type="button" onClick={async () => {
                try {
                  await api.predictScore(myToken, parseInt(predA, 10), parseInt(predB, 10));
                  toast.success('Prediction locked (500 PC exact / 200 PC correct result)');
                  refreshScenario();
                } catch (e) { toast.error(e instanceof ApiError ? String(e.data.error || e.message) : 'Failed'); }
              }} className="w-full py-2 rounded-lg bg-pitch-amber text-pitch-black font-semibold text-sm">
                Lock Score Prediction
              </button>
              {myId && scenario.score_predictions?.[myId] && (
                <p className="text-xs text-pitch-muted mt-2">
                  Your pick: {scenario.score_predictions[myId].score_a}–{scenario.score_predictions[myId].score_b}
                </p>
              )}
            </section>
          )}

          {/* Switch team shortcut */}
          {roomState === 'SCOUTING' && myToken && (
            <section className="bg-pitch-card border border-pitch-border rounded-xl p-4">
              <h3 className="font-semibold mb-2">Switch team (penalty)</h3>
              <p className="text-xs text-pitch-muted mb-2">
                You are Team {myPlayer?.assigned_team || '?'} · Balance {myPlayer?.balance ?? '?'} PC
              </p>
              <button type="button" disabled={myPlayer?.switched_team} onClick={async () => {
                if (!confirm('Switch team? This costs PC and cannot be undone.')) return;
                try {
                  await api.switchTeam(myToken);
                  toast.success('Team switched!');
                  refreshRoomData();
                } catch (e) { toast.error(e instanceof ApiError ? String(e.data.error || e.message) : 'Failed'); }
              }} className="w-full py-2 border border-pitch-red text-pitch-red rounded-lg disabled:opacity-40 text-sm">
                {myPlayer?.switched_team ? 'Already switched' : 'Switch Team'}
              </button>
            </section>
          )}

          {/* Players */}
          <section className="bg-pitch-card border border-pitch-border rounded-xl p-4">
            <h3 className="font-semibold mb-3">Players</h3>
            <div className="space-y-2">
              {players.map((p) => {
                const activeOn = sabotages.filter((s) => s.target_id === p.id);
                const isMe = p.id === myId;
                return (
                  <div key={p.id} className={`flex justify-between p-2 rounded-lg ${isMe ? 'bg-pitch-green/10 border border-pitch-green/30' : 'bg-pitch-dark'}`}>
                    <div>
                      <span className="font-medium">{p.nickname}</span>
                      {isMe && <span className="text-pitch-green text-xs ml-2">YOU</span>}
                      <span className="text-pitch-muted text-xs ml-2">Team {p.assigned_team || '?'}</span>
                    </div>
                    <div className="text-sm text-right">
                      <div>{p.balance} PC</div>
                      {activeOn.length > 0 && (
                        <div className="text-pitch-amber text-xs">{(activeOn as Record<string, string>[]).map((s) => s.token_type).join(', ')}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Match simulation */}
          <section className="bg-pitch-card border border-pitch-border rounded-xl p-4">
            <h3 className="font-semibold mb-2">Live match simulation</h3>
            <p className="text-2xl font-mono mb-1">Egypt {scenario.score_a ?? 0} – {scenario.score_b ?? 0} Belgium</p>
            <p className="text-sm text-pitch-muted mb-3">Min {scenario.match_minute ?? 0}' · {scenario.events_fired ?? 0} events fired</p>
            <div className="flex gap-2 mb-3">
              {[1, 5, 10].map((s) => (
                <button key={s} type="button" onClick={() => setSpeed(s)}
                  className={`px-3 py-1 rounded border text-sm ${speed === s ? 'border-pitch-green text-pitch-green' : 'border-pitch-border'}`}>{s}x</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={roomState !== 'LIVE' || scenario.running} onClick={async () => {
                try {
                  if (roomState !== 'LIVE') {
                    await api.testGoLive();
                    await refreshScenario();
                  }
                  await api.testAdvanceEvent();
                  toast.success('Event fired');
                  refreshScenario();
                } catch (e) { toast.error(e instanceof ApiError ? String(e.data.detail || e.message) : 'Failed'); }
              }} className="px-4 py-2 border border-pitch-border rounded-lg text-sm disabled:opacity-40">
                Fire Next Event
              </button>
              <button type="button" disabled={scenario.running} onClick={async () => {
                if (!confirm(`Run full match at ${speed}x? Keep live tab open for flash bets.`)) return;
                try {
                  if (roomState !== 'LIVE') {
                    await api.testGoLive();
                    await refreshScenario();
                  }
                  const r = await api.testRunAuto(speed);
                  toast.success(r.message as string);
                  refreshScenario();
                } catch (e) { toast.error(e instanceof ApiError ? String(e.data.detail || e.message) : 'Failed'); }
              }} className="px-4 py-2 bg-pitch-green text-pitch-black font-semibold rounded-lg text-sm disabled:opacity-40">
                Run Full Auto ({speed}x)
              </button>
            </div>
          </section>

          {/* Sabotage */}
          <section className="bg-pitch-card border border-pitch-border rounded-xl p-4">
            <h3 className="font-semibold mb-3">Deploy sabotage</h3>
            <div className="flex flex-wrap gap-2">
              <select value={sabotageTarget} onChange={(e) => setSabotageTarget(e.target.value)}
                className="bg-pitch-dark border border-pitch-border rounded-lg px-3 py-2 text-sm">
                <option value="">Target...</option>
                {botPlayers.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
              </select>
              <select value={sabotageType} onChange={(e) => setSabotageType(e.target.value as SabotageType)}
                className="bg-pitch-dark border border-pitch-border rounded-lg px-3 py-2 text-sm">
                {SABOTAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button type="button" disabled={!sabotageTarget || !myToken || !['LIVE', 'SCOUTING', 'DRAFT_LOCKED'].includes(roomState)}
                onClick={async () => {
                  try {
                    await api.deploySabotage(myToken!, sabotageType, sabotageTarget);
                    toast.success('Sabotage deployed');
                    refreshRoomData();
                  } catch (e) { toast.error(e instanceof ApiError ? String(e.data.error || e.message) : 'Failed'); }
                }} className="px-4 py-2 border border-pitch-amber text-pitch-amber rounded-lg text-sm disabled:opacity-40">
                Deploy
              </button>
            </div>
          </section>

          <button type="button" onClick={async () => {
            if (!confirm('Reset test session?')) return;
            await api.testReset();
            setScenario({ active: false });
            setLocalSession(null);
            toast.success('Reset');
          }} className="w-full py-2 border border-pitch-red text-pitch-red rounded-lg">
            Reset session
          </button>
        </div>
      )}
    </div>
  );
}
