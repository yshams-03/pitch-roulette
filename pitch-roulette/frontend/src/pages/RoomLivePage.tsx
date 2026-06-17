import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { playDemoEventSound } from '../lib/demoSounds';
import { isSimulationRoom, showSimulationBadge } from '../lib/roomUtils';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/Avatar';
import { FlashBetCard } from '../components/FlashBetCard';
import { MatchEventsPanel, eventLabel } from '../components/MatchEventsPanel';
import { ReactionOverlay } from '../components/ReactionOverlay';
import { RoomChat } from '../components/RoomChat';
import { RoomConnectionBadge } from '../components/RoomConnectionBadge';
import { TeamCrest } from '../components/TeamCrest';
import { useRoomRealtime } from '../hooks/useRoomRealtime';
import { useRoomRedirect } from '../hooks/useRoomRedirect';
import type { FlashBet, FlashBetAnswer, MatchEventLog, RoomPlayer } from '../../../shared/types';

export function RoomLivePage() {
  const { code } = useParams<{ code: string }>();
  const { session, userId } = useAuthStore();
  const { room, players, connectionStatus, refresh } = useRoomRealtime(code);
  useRoomRedirect(code, room?.state, 'live');
  const [bets, setBets] = useState<FlashBet[]>([]);
  const [answers, setAnswers] = useState<FlashBetAnswer[]>([]);

  useEffect(() => {
    if (!session || !code || !room || !userId) return;
    if (players.some((p) => p.user_id === userId)) return;
    api.joinRoom(session.access_token, code).then(() => refresh()).catch(() => {});
  }, [session, code, room, players, userId, refresh]);

  const loadBets = useCallback(async () => {
    if (!code) return;
    try {
      const r = await api.flashBets(code);
      setBets((r.bets as unknown as FlashBet[]) || []);
    } catch { /* ignore */ }
  }, [code]);

  useEffect(() => { loadBets(); }, [loadBets]);

  // Realtime can miss updates — poll while live (especially demo auto-events).
  useEffect(() => {
    if (!code || room?.state !== 'LIVE') return;
    const id = setInterval(() => {
      refresh();
      loadBets();
    }, 2000);
    return () => clearInterval(id);
  }, [code, room?.state, refresh, loadBets]);

  const openBet = useMemo(() => bets.find((b) => b.state === 'OPEN'), [bets]);
  const pendingBet = openBet ?? bets.find((b) => b.state === 'LOCKED');
  const activeBet = openBet ?? pendingBet;

  useEffect(() => {
    if (!code || !activeBet) return;
    api.flashBetResults(code, activeBet.id).then((res) => {
      setAnswers((res.answers as unknown as FlashBetAnswer[]) || []);
    }).catch(() => setAnswers([]));
  }, [code, activeBet]);

  useEffect(() => {
    if (!supabase || !room?.id) return;
    const roomId = room.id;
    const ch = supabase
      .channel(`flash-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flash_bets', filter: `room_id=eq.${roomId}` }, () => loadBets())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flash_bet_answers', filter: `room_id=eq.${roomId}` }, () => {
        loadBets();
        if (activeBet && code) {
          api.flashBetResults(code, activeBet.id).then((res) => {
            setAnswers((res.answers as unknown as FlashBetAnswer[]) || []);
          }).catch(() => {});
        }
      })
      .subscribe();
    return () => { if (supabase) supabase.removeChannel(ch); };
  }, [room?.id, code, loadBets, activeBet]);

  const history = useMemo(
    () => bets.filter((b) => b.state === 'RESOLVED').slice(0, 5),
    [bets],
  );

  const mySessionPp = players.find((p) => p.user_id === userId)?.session_pp ?? 0;
  const mySessionPc = Math.round(players.find((p) => p.user_id === userId)?.session_pc ?? 100);

  const handleNewEvent = useCallback((event: MatchEventLog) => {
    const ht = room?.match_data?.home_team || 'Home';
    const at = room?.match_data?.away_team || 'Away';
    toast(eventLabel(event.type, ht, at), { duration: 4000 });
    playDemoEventSound(event.type);
  }, [room?.match_data?.home_team, room?.match_data?.away_team]);

  const endMatch = async () => {
    if (!session || !code) return;
    await api.endMatch(session.access_token, code);
    toast.success('Match ended');
    refresh();
  };

  if (!room || !session) return <div className="p-8 text-pitch-muted">Loading live room...</div>;

  const isHost = room.host_id === userId;
  const match = room.match_data;
  const simRoom = isSimulationRoom(room);
  const homeTeam = match?.home_team || 'TBD';
  const awayTeam = match?.away_team || 'TBD';
  const homeGoals = match?.home_goals ?? (room.state === 'RESULTS' ? room.actual_home_goals ?? 0 : 0);
  const awayGoals = match?.away_goals ?? (room.state === 'RESULTS' ? room.actual_away_goals ?? 0 : 0);
  const eventsLog = (match?.events_log || []) as MatchEventLog[];

  const myAnswer = activeBet
    ? answers.find((a) => a.flash_bet_id === activeBet.id && a.user_id === userId)
    : undefined;

  const ppLeaderboard = [...players].sort(
    (a, b) => (b.session_pp ?? 0) - (a.session_pp ?? 0),
  );
  const pcLeaderboard = [...players].sort(
    (a, b) => (b.session_pc ?? 0) - (a.session_pc ?? 0),
  );

  return (
    <div className="px-4 py-6 max-w-lg mx-auto relative">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="font-mono text-pitch-green">{room.room_code}</p>
          {showSimulationBadge(room) && (
            <span
              data-testid="demo-badge"
              className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-pitch-amber/20 text-pitch-amber border border-pitch-amber/40"
            >
              Demo
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-pitch-muted tabular-nums">{mySessionPp.toFixed(1)} PP</span>
          <span className="text-xs text-pitch-amber tabular-nums" data-testid="session-pc">🪙 {mySessionPc} PC</span>
          <RoomConnectionBadge status={connectionStatus} />
        </div>
      </div>

      {match && (
        <div className="ui-surface p-4 mb-4 text-center">
          <div className="flex items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-1 flex-1">
              <TeamCrest name={homeTeam} logo={match.home_logo} size={36} />
              <span data-testid="scoreboard-home" className="text-xs text-pitch-muted truncate max-w-full">{homeTeam}</span>
            </div>
            <div>
              <p className="text-3xl font-mono font-bold text-white">
                {homeGoals} – {awayGoals}
              </p>
              {match.is_live ? (
                <span data-testid="live-badge" className="text-xs text-red-400 animate-pulse">
                  LIVE 🔴 {match.minute ?? ''}&apos;
                </span>
              ) : match.demo ? (
                <span className="text-xs text-pitch-muted">Demo match — events incoming</span>
              ) : null}
            </div>
            <div className="flex flex-col items-center gap-1 flex-1">
              <TeamCrest name={awayTeam} logo={match.away_logo} size={36} />
              <span data-testid="scoreboard-away" className="text-xs text-pitch-muted truncate max-w-full">{awayTeam}</span>
            </div>
          </div>
        </div>
      )}

      {simRoom && (
        <MatchEventsPanel
          events={eventsLog}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          onNewEvent={handleNewEvent}
        />
      )}

      {activeBet && (
        <FlashBetCard
          key={activeBet.id}
          bet={activeBet}
          code={code!}
          token={session.access_token}
          myAnswer={myAnswer}
          onAnswered={() => {
            loadBets();
            if (code && activeBet) {
              api.flashBetResults(code, activeBet.id).then((res) => {
                setAnswers((res.answers as FlashBetAnswer[]) || []);
              }).catch(() => {});
            }
            refresh();
          }}
        />
      )}

      {!openBet && simRoom && room.state === 'LIVE' && (
        <p className="text-sm text-center text-pitch-muted mb-4 animate-pulse">
          Next flash bet incoming…
        </p>
      )}

      {history.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs text-pitch-muted mb-2 uppercase tracking-wide">Recent flash bets</h2>
          <div className="space-y-2">
            {history.map((b) => (
              <div key={b.id} className="rounded-lg bg-pitch-card border border-pitch-border px-3 py-2 text-xs">
                <p className="text-white">{b.question}</p>
                {b.correct_option && (
                  <p className="text-pitch-muted mt-1">Answer: {b.correct_option}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ui-surface p-3 mb-4">
        <h2 className="text-xs text-pitch-muted mb-2 uppercase tracking-wide">Session PP</h2>
        <div className="space-y-2">
          {ppLeaderboard.map((p: RoomPlayer, i) => (
            <div key={p.user_id} className="flex items-center gap-2">
              <span className="w-4 text-xs text-pitch-muted">{i + 1}</span>
              <Avatar name={p.display_name || '?'} color={p.avatar_color} size="sm" />
              <span className="text-sm text-white flex-1 truncate">{p.display_name}</span>
              <span className="text-sm font-mono text-pitch-green">{(p.session_pp ?? 0).toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ui-surface p-3 mb-4">
        <h2 className="text-xs text-pitch-muted mb-2 uppercase tracking-wide">Party chips (PC)</h2>
        <div className="space-y-2">
          {pcLeaderboard.map((p: RoomPlayer, i) => (
            <div key={`pc-${p.user_id}`} className="flex items-center gap-2">
              <span className="w-4 text-xs text-pitch-muted">{i + 1}</span>
              <Avatar name={p.display_name || '?'} color={p.avatar_color} size="sm" />
              <span className="text-sm text-white flex-1 truncate">{p.display_name}</span>
              <span className="text-sm font-mono text-pitch-amber">{Math.round(p.session_pc ?? 0)}</span>
            </div>
          ))}
        </div>
      </div>

      <ReactionOverlay roomId={room.id} userId={userId!} />

      <RoomChat
        roomId={room.id}
        code={code!}
        token={session.access_token}
        enabled={room.chat_enabled !== false}
      />

      {isHost && (
        <button type="button" onClick={endMatch}
          className="w-full min-h-11 rounded-xl border border-pitch-amber text-pitch-amber mt-4">
          End match / Go to results
        </button>
      )}

      {isHost && (
        <Link to={`/host/${code}`} className="block text-center text-xs text-pitch-muted mt-3">
          Host panel →
        </Link>
      )}
    </div>
  );
}
