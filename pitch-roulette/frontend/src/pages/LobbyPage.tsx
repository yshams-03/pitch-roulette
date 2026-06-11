import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { QrCode, Copy, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';
import { useGameStore } from '../store/gameStore';
import { useRoomSubscription } from '../hooks/useRoomSubscription';
import { ChipBalance } from '../components/ChipBalance';
import { ReconnectBanner } from '../components/ReconnectBanner';

export function LobbyPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { roomId, players, roomState, isHost, hydrateFromRoom, teamAName, teamBName, matchId, sessionToken } = useGameStore();
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  useRoomSubscription(roomId);

  useEffect(() => {
    if (!code) return;
    api.getRoom(code)
      .then((room) => {
        hydrateFromRoom(room);
        setLoading(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.data.error === 'room_expired') {
          toast.error('This session has expired. Start a new game.');
        } else {
          toast.error('No room found with that code. Double-check and try again.');
        }
        navigate('/');
      });
  }, [code, hydrateFromRoom, navigate]);

  useEffect(() => {
    if (roomState === 'SCOUTING') navigate(`/room/${code}/scouting`);
    else if (roomState === 'DRAFT_LOCKED') navigate(`/room/${code}/draft`);
    else if (roomState === 'LIVE' || roomState === 'FULL_TIME') {
      toast('This game is in progress', { icon: '⚽' });
      navigate(`/room/${code}/live`);
    }
    else if (roomState === 'RESULTS') navigate(`/room/${code}/results`);
  }, [roomState, code, navigate]);

  const joinUrl = `${window.location.origin}/?join=${code}`;

  const copyCode = () => {
    navigator.clipboard.writeText(code || '');
    toast.success('Code copied!');
  };

  const handleStartDraft = async () => {
    if (!code || !sessionToken) return;
    setStarting(true);
    setStartError('');
    try {
      await api.startDraft(code, sessionToken);
    } catch (e) {
      if (e instanceof ApiError) {
        setStartError((e.data.error as string) || 'Failed to start draft');
      } else {
        setStartError('Failed to start draft');
      }
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-pitch-black px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="h-8 w-24 animate-pulse rounded bg-pitch-card" />
          <div className="h-8 w-20 animate-pulse rounded bg-pitch-card" />
        </div>
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-pitch-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pitch-black px-4 py-6">
      <ReconnectBanner />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-pitch-muted">Room</p>
          <button onClick={copyCode} className="flex items-center gap-2 font-mono text-2xl font-bold text-pitch-green">
            {code}
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <ChipBalance />
      </div>

      {matchId && (
        <div className="mb-4 rounded-xl border border-pitch-border bg-pitch-card p-4 text-center">
          <p className="text-sm text-pitch-muted">Match</p>
          <p className="font-medium text-white">{teamAName} vs {teamBName}</p>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-pitch-border bg-pitch-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-white">Players ({players.length})</h2>
          <div className="flex h-2 w-2 animate-pulse rounded-full bg-pitch-green" />
        </div>
        <div className="space-y-2">
          {players.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg bg-pitch-dark px-3 py-2">
              <span className="text-white">
                {p.nickname}
                {p.is_host && <span className="ml-2 text-xs text-pitch-amber">HOST</span>}
              </span>
              <span className={`h-2 w-2 rounded-full ${p.is_connected ? 'bg-pitch-green' : 'bg-pitch-muted'}`} />
            </div>
          ))}
        </div>
        {players.length === 0 && (
          <p className="text-center text-sm text-pitch-muted animate-pulse">Waiting for players...</p>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-dashed border-pitch-border bg-pitch-card p-6 text-center">
        <QrCode className="mx-auto mb-2 h-8 w-8 text-pitch-muted" />
        <p className="mb-2 text-sm text-pitch-muted">Share this link to invite friends</p>
        <p className="mb-3 break-all font-mono text-xs text-pitch-green">{joinUrl}</p>
        <button
          onClick={() => { navigator.clipboard.writeText(joinUrl); toast.success('Link copied!'); }}
          className="text-sm text-pitch-amber"
        >
          Copy invite link
        </button>
      </div>

      {isHost && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleStartDraft}
            disabled={starting || players.length < 1}
            className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-pitch-green py-3 font-bold text-pitch-black disabled:opacity-50"
          >
            {starting ? 'Starting…' : 'Start Draft'}
          </button>
          {startError && <p className="text-center text-sm text-pitch-red">{startError}</p>}
          <a
            href={`/host/${code}`}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-pitch-amber py-3 text-pitch-amber"
          >
            <ExternalLink className="h-4 w-4" />
            Host Control Panel
          </a>
        </div>
      )}

      {!isHost && (
        <p className="text-center text-sm text-pitch-muted animate-pulse">
          Waiting for host to start the draft...
        </p>
      )}
    </div>
  );
}
