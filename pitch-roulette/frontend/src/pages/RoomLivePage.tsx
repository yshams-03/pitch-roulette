import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { snapshotFromApi } from '../lib/roomSnapshot';
import { supabase } from '../lib/supabase';
import { playDemoEventSound } from '../lib/demoSounds';
import { isSimulationRoom, showSimulationBadge } from '../lib/roomUtils';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/Avatar';
import { TeamCrest } from '../components/TeamCrest';
import { FlashBetCard } from '../components/FlashBetCard';
import { MatchFacts, GoalScorersLine, parseGroupKey } from '../components/MatchFacts';
import { eventLabel } from '../components/MatchEventsPanel';
import { ReactionOverlay } from '../components/ReactionOverlay';
import { RoomChat } from '../components/RoomChat';
import { RoomConnectionBadge } from '../components/RoomConnectionBadge';
import { SabotageShop } from '../components/SabotageShop';
import { SabotageNotification } from '../components/SabotageNotification';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useRoomRealtime } from '../hooks/useRoomRealtime';
import { useRoomRedirect } from '../hooks/useRoomRedirect';
import type { FlashBet, FlashBetAnswer, MatchEventLog, MatchFactsData, RoomPlayer, Sabotage } from '../../../shared/types';

export function RoomLivePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, userId } = useAuthStore();
  const flags = useFeatureFlags();
  const { room, players, connectionStatus, refresh, applySnapshot, patchRoom } = useRoomRealtime(code);
  useRoomRedirect(code, room?.state, 'live');
  const [bets, setBets] = useState<FlashBet[]>([]);
  const [answers, setAnswers] = useState<FlashBetAnswer[]>([]);
  const [targetingMe, setTargetingMe] = useState<Sabotage[]>([]);
  const [sabotageAlert, setSabotageAlert] = useState<(Sabotage & { buyer_name?: string }) | null>(null);
  const [mobileTab, setMobileTab] = useState<'standings' | 'events' | 'chat'>('standings');
  const [mobileEventsSubTab, setMobileEventsSubTab] = useState<'facts' | 'stats'>('facts');
  const [matchFacts, setMatchFacts] = useState<MatchFactsData | null>(null);
  const [silenceSecs, setSilenceSecs] = useState(0);
  const [ending, setEnding] = useState(false);

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

  const loadSabotages = useCallback(async () => {
    if (!session || !code) return;
    try {
      const r = await api.listSabotages(session.access_token, code);
      const active = (r.targeting_me as Sabotage[]) || [];
      setTargetingMe(active);
      const silence = active.find((s) => s.sabotage_type === 'SILENCE');
      if (silence?.expires_at) {
        const rem = Math.max(0, Math.ceil((new Date(silence.expires_at).getTime() - Date.now()) / 1000));
        setSilenceSecs(rem);
      } else {
        setSilenceSecs(0);
      }
    } catch { /* ignore */ }
  }, [session, code]);

  useEffect(() => {
    if (!session || !code || room?.state !== 'LIVE') return;
    loadSabotages();
  }, [session, code, room?.state, loadSabotages]);

  useEffect(() => {
    if (silenceSecs <= 0) return;
    const id = setInterval(() => {
      setSilenceSecs((s) => {
        if (s <= 1) {
          loadSabotages();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [silenceSecs, loadSabotages]);

  useEffect(() => {
    if (!supabase || !room?.id || !userId) return;
    const roomId = room.id;
    const ch = supabase
      .channel(`sabotage-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sabotages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as Sabotage;
          if (row.target_id !== userId) return;
          if (row.sabotage_type === 'MIRROR') return;
          const buyer = players.find((p) => p.user_id === row.buyer_id);
          setSabotageAlert({ ...row, buyer_name: buyer?.display_name });
          loadSabotages();
          refresh();
        },
      )
      .subscribe();
    return () => { if (supabase) supabase.removeChannel(ch); };
  }, [room?.id, userId, players, loadSabotages, refresh]);

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
    setEnding(true);
    patchRoom({ state: 'RESULTS' });
    try {
      const res = await api.endMatch(session.access_token, code);
      const snap = snapshotFromApi(res);
      if (snap) applySnapshot(snap);
      toast.success('Match ended');
      navigate(`/room/${code}/results`);
    } catch (e) {
      refresh();
      toast.error(e instanceof Error ? e.message : 'Could not end match');
    } finally {
      setEnding(false);
    }
  };

  if (!room || !session) return (
    <div className="p-8 space-y-3 max-w-lg mx-auto">
      <div className="h-16 skeleton" />
      <div className="h-32 skeleton" />
    </div>
  );

  const isHost = room.host_id === userId;
  const match = room.match_data;
  const simRoom = isSimulationRoom(room);
  const homeTeam = match?.home_team || 'TBD';
  const awayTeam = match?.away_team || 'TBD';
  const homeGoals = match?.home_goals ?? (room.state === 'RESULTS' ? room.actual_home_goals ?? 0 : 0);
  const awayGoals = match?.away_goals ?? (room.state === 'RESULTS' ? room.actual_away_goals ?? 0 : 0);
  const roomEnded = room.state === 'RESULTS' || room.state === 'FULL_TIME';
  const factsEvents = matchFacts?.events || [];
  const displayHomeGoals = matchFacts?.match.home_score ?? homeGoals;
  const displayAwayGoals = matchFacts?.match.away_score ?? awayGoals;
  const matchStatus = matchFacts?.match.status;
  const matchMinute = matchFacts?.match.minute ?? match?.minute;
  const addedTime = matchFacts?.match.added_time;
  const groupKey = parseGroupKey(match?.group_name);

  const myAnswer = activeBet
    ? answers.find((a) => a.flash_bet_id === activeBet.id && a.user_id === userId)
    : undefined;

  const ppLeaderboard = [...players].sort(
    (a, b) => (b.session_pp ?? 0) - (a.session_pp ?? 0),
  );

  const blindfolded = targetingMe.some((s) => s.sabotage_type === 'BLINDFOLD');

  return (
    <div className="px-4 py-4 max-w-6xl mx-auto relative pb-24">
      {sabotageAlert && (
        <SabotageNotification
          notification={sabotageAlert}
          onDismiss={() => setSabotageAlert(null)}
        />
      )}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="code text-[var(--pr-green)]">{room.room_code}</p>
          {showSimulationBadge(room) && (
            <span data-testid="demo-badge" className="badge badge-gold">Demo</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-secondary)] tabular-nums">{mySessionPp.toFixed(1)} PP</span>
          <span className="pc-chip text-xs" data-testid="session-pc">🪙 {mySessionPc}</span>
          <RoomConnectionBadge status={connectionStatus} />
        </div>
      </div>

      {match && (
        <div
          className={`surface sticky top-14 z-20 p-4 mb-4 text-center ${
            match.is_live ? 'border-b-2 border-b-[var(--pr-green)]' : ''
          }`}
        >
          <div className="flex items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <TeamCrest name={homeTeam} logo={match.home_logo} size="lg" />
              <span data-testid="scoreboard-home" className="text-xs text-[var(--text-secondary)] truncate max-w-full">{homeTeam}</span>
            </div>
            <div>
              <p className="score text-3xl tabular-nums">
                {displayHomeGoals} – {displayAwayGoals}
              </p>
              <div className="match-status-line">
                {match.is_live || matchStatus === '1H' || matchStatus === '2H' ? (
                  <span data-testid="live-badge" className="badge badge-live pulse-red">
                    ● LIVE {matchMinute ?? ''}&apos;
                  </span>
                ) : matchStatus === 'HT' ? (
                  <span className="badge">HT</span>
                ) : matchStatus === 'FT' ? (
                  <span className="text-xs text-[var(--text-muted)]">FT</span>
                ) : match.demo ? (
                  <span className="text-xs text-[var(--text-muted)]">Demo match</span>
                ) : null}
                {addedTime != null && addedTime > 0 && (
                  <span className="text-[var(--text-muted)]">+{addedTime} min</span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <TeamCrest name={awayTeam} logo={match.away_logo} size="lg" />
              <span data-testid="scoreboard-away" className="text-xs text-[var(--text-secondary)] truncate max-w-full">{awayTeam}</span>
            </div>
          </div>
          {factsEvents.length > 0 && <GoalScorersLine events={factsEvents} />}
        </div>
      )}

      <nav className="pr-tabs mb-4 md:hidden">
        {([
          ['standings', 'Standings'],
          ['events', 'Events'],
          ['chat', 'Chat'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" className="pr-tab" data-active={mobileTab === id} onClick={() => setMobileTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="md:grid md:grid-cols-[1fr_1.2fr] md:gap-4 md:mb-4">
        <div className={`space-y-4 ${mobileTab !== 'events' ? 'hidden md:block' : ''}`}>
          {activeBet && flags.flash_bets && (
            <FlashBetCard
              key={activeBet.id}
              bet={activeBet}
              code={code!}
              token={session.access_token}
              myAnswer={myAnswer}
              blindfolded={blindfolded}
              onAnswered={() => {
                loadBets();
                if (code && activeBet) {
                  api.flashBetResults(code, activeBet.id).then((res) => {
                    setAnswers((res.answers as FlashBetAnswer[]) || []);
                  }).catch(() => {});
                }
                refresh();
                loadSabotages();
              }}
            />
          )}

          {!openBet && simRoom && room.state === 'LIVE' && (
            <p className="text-sm text-center text-[var(--text-muted)] waiting-pulse">
              Next flash bet incoming…
            </p>
          )}
        </div>

        <div className={`space-y-2 ${mobileTab !== 'events' ? 'hidden md:block' : ''}`}>
          {mobileTab === 'events' && (
            <div className="md:hidden match-facts-tabs border border-[var(--border)] rounded-t-[var(--radius-md)] overflow-hidden">
              {(['facts', 'stats'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  className="match-facts-tab"
                  data-active={mobileEventsSubTab === id}
                  onClick={() => setMobileEventsSubTab(id)}
                >
                  {id === 'facts' ? 'Facts' : 'Stats'}
                </button>
              ))}
            </div>
          )}
          <MatchFacts
            roomCode={code!}
            matchId={room.match_id}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            groupKey={groupKey}
            isLive={room.state === 'LIVE' && (match?.is_live ?? true)}
            roomEnded={roomEnded}
            activeFlashBet={openBet ?? null}
            onNewEvent={handleNewEvent}
            onFactsUpdate={setMatchFacts}
            hideTableTab={mobileTab === 'events'}
            forcedTab={mobileTab === 'events' ? mobileEventsSubTab : undefined}
          />
        </div>
      </div>

      <div className={`space-y-4 mb-4 ${mobileTab !== 'standings' ? 'hidden md:block' : ''}`}>
          <div className="surface p-3">
            <h2 className="text-xs text-[var(--text-secondary)] mb-2 uppercase font-semibold">Session PP</h2>
            <div className="space-y-2">
              {ppLeaderboard.map((p: RoomPlayer, i) => (
                <div key={p.user_id} className={`flex items-center gap-2 rounded-[var(--radius-sm)] px-1 ${p.user_id === userId ? 'table-row-you' : ''}`}>
                  <span className="w-4 text-xs text-[var(--text-muted)]">{i + 1}</span>
                  <Avatar name={p.display_name || '?'} color={p.avatar_color} size="sm" />
                  <span className="text-sm flex-1 truncate">{p.display_name}</span>
                  <span className={`w-2 h-2 rounded-full ${p.assigned_side === 'HOME' ? 'bg-[var(--pr-blue)]' : 'bg-[var(--pr-red)]'}`} />
                  <span className="text-sm score text-[var(--pr-green)] tabular-nums">{(p.session_pp ?? 0).toFixed(1)}</span>
                  <span className="text-xs pc-chip">🪙 {Math.round(p.session_pc ?? 0)}</span>
                </div>
              ))}
            </div>
          </div>

          {history.length > 0 && (
            <div>
              <h2 className="text-xs text-[var(--text-secondary)] mb-2 uppercase font-semibold">Recent flash bets</h2>
              <div className="space-y-2">
                {history.map((b) => (
                  <div key={b.id} className="surface px-3 py-2 text-xs">
                    <p>{b.question}</p>
                    {b.correct_option && <p className="text-[var(--text-muted)] mt-1">Answer: {b.correct_option}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      <div className={mobileTab !== 'chat' ? 'hidden md:block' : ''}>
        <RoomChat
          roomId={room.id}
          code={code!}
          token={session.access_token}
          enabled={room.chat_enabled !== false}
          silencedSeconds={silenceSecs}
        />
      </div>

      <ReactionOverlay roomId={room.id} userId={userId!} />

      {room.state === 'LIVE' && flags.sabotage_shop && (
        <SabotageShop
          code={code!}
          token={session.access_token}
          players={players}
          userId={userId!}
          sessionPc={mySessionPc}
          onPurchased={() => { refresh(); loadSabotages(); }}
        />
      )}

      {isHost && (
        <button type="button" onClick={endMatch} disabled={ending} className="btn btn-secondary w-full mt-4 border-[var(--pr-gold)] text-[var(--pr-gold)]">
          {ending ? 'Ending match…' : 'End match / Go to results'}
        </button>
      )}

      {isHost && (
        <Link to={`/host/${code}`} className="block text-center text-xs text-[var(--text-muted)] mt-3">
          Host panel →
        </Link>
      )}
    </div>
  );
}
