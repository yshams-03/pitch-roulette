import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Skull } from 'lucide-react';
import { api } from '../lib/api';
import { useGameStore } from '../store/gameStore';
import { useRoomSubscription } from '../hooks/useRoomSubscription';
import { useLivePolling } from '../hooks/useLivePolling';
import { ChipBalance } from '../components/ChipBalance';
import { ReconnectBanner } from '../components/ReconnectBanner';
import { FlashBetOverlay } from '../components/FlashBetOverlay';
import { FantasyTracker } from '../components/FantasyTracker';
import { SabotageShop } from '../components/SabotageShop';
import { TrashTalkChat } from '../components/TrashTalkChat';
import { MomentumIndicator } from '../components/MomentumIndicator';
import { SuperSubAlert, useSuperSubDetection } from '../components/SuperSubAlert';
import type { FlashBet, ChatMessage, Sabotage } from '../../../shared/types';

export function LivePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const {
    roomId, roomState, teamAName, teamBName, liveScore, matchClock,
    activeBet, settings, sessionToken, setActiveBet, setMyFantasyPicks, setMyFantasyScores,
    activeSabotages,
  } = useGameStore();

  const [shopOpen, setShopOpen] = useState(false);
  const [dismissedBetId, setDismissedBetId] = useState<string | null>(null);
  const [possession, setPossession] = useState({ a: 50, b: 50 });
  const [fantasyLoading, setFantasyLoading] = useState(true);
  const { alert: superSubAlert, clearAlert } = useSuperSubDetection();

  useRoomSubscription(roomId);
  useLivePolling();

  useEffect(() => {
    if (roomState === 'RESULTS') navigate(`/room/${code}/results`);
    else if (roomState === 'LOBBY') navigate(`/room/${code}/lobby`);
    else if (roomState === 'DRAFT_LOCKED') navigate(`/room/${code}/draft`);
    else if (roomState === 'SCOUTING') navigate(`/room/${code}/scouting`);
  }, [roomState, code, navigate]);

  useEffect(() => {
    if (!roomId) return;
    api.getActiveBet(roomId).then((res) => {
      if (res.bet) setActiveBet(res.bet as unknown as FlashBet);
    }).catch(() => {});
  }, [roomId, setActiveBet]);

  useEffect(() => {
    if (sessionToken) {
      setFantasyLoading(true);
      api.getMe(sessionToken).then((me) => {
        if (me.fantasy_picks) setMyFantasyPicks(me.fantasy_picks as Parameters<typeof setMyFantasyPicks>[0]);
        if (me.fantasy_scores) setMyFantasyScores(me.fantasy_scores as Parameters<typeof setMyFantasyScores>[0]);
      }).catch(() => {}).finally(() => setFantasyLoading(false));
      if (roomId) {
        api.getActiveSabotages(roomId, sessionToken).then((res) => {
          useGameStore.getState().setActiveSabotages(res.sabotages as unknown as Sabotage[]);
        }).catch(() => {});
      }
    } else {
      setFantasyLoading(false);
    }
  }, [sessionToken, roomId, setMyFantasyPicks, setMyFantasyScores]);

  useEffect(() => {
    const matchId = useGameStore.getState().matchId;
    if (!matchId) return;
    const poll = () => {
      api.getLiveMatch(matchId).then((data) => {
        const stats = data.stats as { response?: Array<{ statistics: Array<{ type: string; value: string | number }> }> };
        const teams = stats?.response;
        if (teams && teams.length >= 2) {
          const getPoss = (team: { statistics: Array<{ type: string; value: string | number }> }) => {
            const p = team.statistics.find((s: { type: string }) => s.type === 'Ball Possession');
            return parseInt(String(p?.value || '50').replace('%', '')) || 50;
          };
          setPossession({ a: getPoss(teams[0]), b: getPoss(teams[1]) });
        }
      }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 120000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (roomId) {
      api.getChatMessages(roomId).then((res) => {
        useGameStore.getState().setChatMessages(res.messages as unknown as ChatMessage[]);
      }).catch(() => {});
    }
  }, [roomId]);

  const showBet = activeBet &&
    (activeBet.state === 'FROZEN' || activeBet.state === 'OPEN') &&
    activeBet.id !== dismissedBetId;

  return (
    <div className="min-h-screen bg-pitch-black px-4 py-6 pb-24">
      <ReconnectBanner />

      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-pitch-muted">{matchClock}</p>
          <div className="flex items-center gap-3 font-mono text-xl font-bold text-white">
            <span className="text-right w-24 truncate">{teamAName}</span>
            <span className="text-pitch-green">{liveScore.a} - {liveScore.b}</span>
            <span className="w-24 truncate">{teamBName}</span>
          </div>
        </div>
        <ChipBalance />
      </div>

      <div className="mb-4 space-y-4">
        <MomentumIndicator possessionA={possession.a} possessionB={possession.b} />
        {settings.module_fantasy && (
          fantasyLoading ? (
            <div className="space-y-3">
              <div className="h-4 w-32 animate-pulse rounded bg-pitch-card" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-pitch-card" />
              ))}
            </div>
          ) : (
            <FantasyTracker />
          )
        )}
      </div>

      {settings.module_sabotage && (
        <button
          type="button"
          onClick={() => setShopOpen(true)}
          className="fixed bottom-36 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-pitch-red bg-pitch-card text-pitch-red shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-red"
          aria-label="Open sabotage shop"
        >
          <Skull className="h-5 w-5" />
        </button>
      )}

      <TrashTalkChat disabled={!!showBet} />
      <SabotageShop open={shopOpen} onClose={() => setShopOpen(false)} />

      {showBet && (
        <FlashBetOverlay
          bet={activeBet}
          onDismiss={() => setDismissedBetId(activeBet.id)}
        />
      )}

      {superSubAlert && (
        <SuperSubAlert
          playerName={superSubAlert}
          onDismiss={clearAlert}
          onAct={clearAlert}
        />
      )}

      {activeSabotages.length > 0 && (
        <div className="fixed top-12 inset-x-4 z-20 flex flex-wrap gap-2">
          {activeSabotages.map((s) => (
            <span key={s.id} className="rounded-full bg-pitch-red/20 px-3 py-1 text-xs text-pitch-red">
              {s.token_type === 'JINX'
                ? `🪄 Jinxed — ${s.sender_nickname || 'Someone'} is watching your players`
                : `${s.token_type.replace('_', ' ')} active`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
