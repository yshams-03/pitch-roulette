import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { saveSession } from '../lib/session';
import { useGameStore } from '../store/gameStore';
import type { MatchSearchResult } from '../../../shared/types';

export function LandingPage() {
  const navigate = useNavigate();
  const { setSession, hydrateFromRoom } = useGameStore();
  const urlJoin = new URLSearchParams(window.location.search).get('join')?.toUpperCase() || '';
  const [mode, setMode] = useState<'home' | 'create' | 'join'>(urlJoin ? 'join' : 'home');
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState(urlJoin);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [matches, setMatches] = useState<MatchSearchResult[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchSearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    setSearching(true);
    try {
      const res = await api.searchMatches(searchQuery);
      setMatches(res.matches as unknown as MatchSearchResult[]);
    } catch {
      setError('Failed to search matches');
    } finally {
      setSearching(false);
    }
  };

  const handleCreate = async () => {
    if (!nickname.trim()) {
      setError('Enter a nickname to continue');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.createRoom({
        nickname: nickname.trim(),
        match_id: selectedMatch?.id?.toString(),
        match_name: selectedMatch ? `${selectedMatch.team_a} vs ${selectedMatch.team_b}` : undefined,
        team_a_name: selectedMatch?.team_a,
        team_b_name: selectedMatch?.team_b,
      });
      saveSession({
        sessionToken: result.host_token,
        playerId: result.player_id,
        roomCode: result.code,
        isHost: true,
      });
      setSession(result.host_token, result.player_id, result.code, true);
      const room = await api.getRoom(result.code);
      hydrateFromRoom(room, result.player_id);
      navigate(`/room/${result.code}/lobby`);
    } catch (e) {
      setError(e instanceof ApiError ? (e.data.error as string) || 'Failed to create room' : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!nickname.trim()) {
      setError('Enter a nickname to continue');
      return;
    }
    if (joinCode.length !== 6) {
      setError('Room code must be 6 characters');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.joinRoom(joinCode.toUpperCase(), nickname.trim());
      saveSession({
        sessionToken: result.session_token,
        playerId: result.player_id,
        roomCode: result.code,
        isHost: false,
      });
      setSession(result.session_token, result.player_id, result.code, false);
      const room = await api.getRoom(result.code);
      hydrateFromRoom(room, result.player_id);
      const stateRoute = (room.state as string).toLowerCase().replace('_', '-');
      const routeMap: Record<string, string> = {
        lobby: 'lobby',
        scouting: 'scouting',
        'draft-locked': 'draft',
        live: 'live',
        'full-time': 'live',
        results: 'results',
      };
      navigate(`/room/${result.code}/${routeMap[stateRoute] || 'lobby'}`);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 404) {
          setError('No room found with that code. Double-check and try again.');
        } else if (e.status === 409 && e.data.error === 'invalid_state') {
          setError('This game is already in progress. You cannot join now.');
        } else if (e.data.error === 'room_expired') {
          setError('This session has expired. Start a new game.');
        } else {
          setError((e.data.error as string) || 'Failed to join');
        }
      } else {
        setError('Network error. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'home') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-pitch-black px-4">
        <div className="mb-12 text-center">
          <h1 className="mb-2 text-4xl font-bold text-pitch-green">Pitch Roulette</h1>
          <p className="text-pitch-muted">Real-time football party game. No app. Just a URL.</p>
        </div>
        <div className="w-full max-w-sm space-y-3">
          <button
            onClick={() => setMode('create')}
            className="w-full rounded-xl bg-pitch-green py-4 text-lg font-bold text-pitch-black"
          >
            Create Session
          </button>
          <button
            onClick={() => setMode('join')}
            className="w-full rounded-xl border border-pitch-border py-4 text-lg font-medium text-white"
          >
            Join Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pitch-black px-4 py-8">
      <button onClick={() => { setMode('home'); setError(''); }} className="mb-6 text-sm text-pitch-muted">
        ← Back
      </button>

      <h2 className="mb-6 text-2xl font-bold text-white">
        {mode === 'create' ? 'Create Session' : 'Join Session'}
      </h2>

      <div className="mx-auto max-w-sm space-y-4">
        <div>
          <label className="mb-1 block text-sm text-pitch-muted">Nickname</label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={30}
            placeholder="Your display name"
            className="w-full rounded-xl border border-pitch-border bg-pitch-card px-4 py-3 text-white placeholder:text-pitch-muted focus:outline-none focus:ring-1 focus:ring-pitch-green"
          />
        </div>

        {mode === 'join' && (
          <div>
            <label className="mb-1 block text-sm text-pitch-muted">Room Code</label>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              className="w-full rounded-xl border border-pitch-border bg-pitch-card px-4 py-3 font-mono text-lg uppercase tracking-widest text-white placeholder:text-pitch-muted focus:outline-none focus:ring-1 focus:ring-pitch-green"
            />
          </div>
        )}

        {mode === 'create' && (
          <div>
            <label className="mb-1 block text-sm text-pitch-muted">Match (optional)</label>
            <div className="flex gap-2">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search team name..."
                className="flex-1 rounded-xl border border-pitch-border bg-pitch-card px-4 py-3 text-white placeholder:text-pitch-muted focus:outline-none focus:ring-1 focus:ring-pitch-green"
              />
              <button
                onClick={handleSearch}
                disabled={searching}
                className="rounded-xl bg-pitch-dark px-4 text-sm text-pitch-green border border-pitch-border"
              >
                {searching ? '...' : 'Search'}
              </button>
            </div>
            {searching && (
              <div className="mt-2 space-y-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-pitch-card" />
                ))}
              </div>
            )}
            {selectedMatch && (
              <div className="mt-2 rounded-lg bg-pitch-green/10 border border-pitch-green/30 p-3 text-sm text-white">
                {selectedMatch.team_a} vs {selectedMatch.team_b}
                <button onClick={() => setSelectedMatch(null)} className="ml-2 text-pitch-muted">✕</button>
              </div>
            )}
            {matches.length > 0 && !selectedMatch && (
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedMatch(m); setMatches([]); }}
                    className="w-full rounded-lg bg-pitch-dark p-2 text-left text-sm text-white hover:bg-pitch-card"
                  >
                    {m.team_a} vs {m.team_b}
                    <span className="block text-xs text-pitch-muted">{m.venue}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-pitch-red">{error}</p>}

        <button
          onClick={mode === 'create' ? handleCreate : handleJoin}
          disabled={loading || !nickname.trim() || (mode === 'join' && joinCode.length !== 6)}
          className="w-full rounded-xl bg-pitch-green py-4 font-bold text-pitch-black disabled:opacity-40"
        >
          {loading ? 'Loading...' : mode === 'create' ? 'Create & Enter Lobby' : 'Join Game'}
        </button>
      </div>
    </div>
  );
}
