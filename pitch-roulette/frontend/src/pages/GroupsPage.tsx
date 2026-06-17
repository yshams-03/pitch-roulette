import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/ui/Badge';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Tabs } from '../components/ui/Tabs';
import { TeamCrest } from '../components/TeamCrest';
import type { MatchSummary } from '../../../shared/types';

const EMOJI_OPTIONS = ['⚽', '🏆', '🔥', '⭐', '🌍', '🇫🇷', '🇧🇷', '🇩🇪', '🇪🇸', '🇮🇹', '🇳🇱', '🇵🇹', '🦁', '🎯', '🍻', '🎉', '💚', '👑', '🚀', '⚡'];

export function GroupsPage() {
  const { session } = useAuthStore();
  const [groups, setGroups] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    api.myGroups(session.access_token)
      .then((r) => setGroups(r.groups))
      .catch(() => toast.error('Failed to load groups'))
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">Your Groups</h1>
        <Link to="/groups/create" className="btn btn-primary btn-sm no-underline">Create</Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 skeleton" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {groups.map((g) => (
            <Link key={String(g.id)} to={`/groups/${g.id}`} className="no-underline">
              <Card className="p-4 h-full" glow="green">
                <span className="text-4xl block mb-2">{String(g.emoji)}</span>
                <p className="font-semibold truncate">{String(g.name)}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">{String(g.member_count)} members</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {groups.length === 0 && !loading && (
        <p className="text-[var(--text-muted)] text-center py-12">No groups yet — create one!</p>
      )}

      <Link to="/groups/join" className="btn btn-secondary w-full no-underline mt-6 text-center block">
        Join with invite code
      </Link>
    </div>
  );
}

export function GroupCreatePage() {
  const { session } = useAuthStore();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('⚽');
  const navigate = useNavigate();

  const create = async () => {
    if (!session || !name.trim()) return;
    const g = await api.createGroup(session.access_token, name.trim(), emoji);
    navigate(`/groups/${(g as Record<string, unknown>).id}`);
  };

  return (
    <div className="px-4 py-6 max-w-sm mx-auto space-y-4">
      <h1 className="text-xl font-bold">Create group</h1>
      <div className="grid grid-cols-5 gap-2">
        {EMOJI_OPTIONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEmoji(e)}
            className={`text-2xl p-2 rounded-[var(--radius-md)] border ${
              emoji === e ? 'border-[var(--pr-green)] bg-[rgba(0,230,118,0.1)]' : 'border-[var(--border)]'
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      <Input label="Group name" value={name} onChange={(ev) => setName(ev.target.value)} />
      <Button variant="primary" size="lg" fullWidth onClick={create}>Create Group</Button>
    </div>
  );
}

export function GroupJoinPage() {
  const { session } = useAuthStore();
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  const join = async () => {
    if (!session) return;
    const r = await api.joinGroup(session.access_token, code.toUpperCase()) as { group: { id: string } };
    navigate(`/groups/${r.group.id}`);
  };

  return (
    <div className="px-4 py-6 max-w-sm mx-auto space-y-4">
      <h1 className="text-xl font-bold">Join group</h1>
      <Input
        label="Invite code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        className="code uppercase"
      />
      <Button variant="primary" size="lg" fullWidth onClick={join}>Join</Button>
    </div>
  );
}

export function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session, userId } = useAuthStore();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState<'leaderboard' | 'history'>('leaderboard');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [liveMatches, setLiveMatches] = useState<MatchSummary[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!session || !id) return;
    api.groupDetail(session.access_token, id).then(setData).catch(() => toast.error('Failed to load group'));
  }, [session, id]);

  const openMatchPicker = async () => {
    if (!session) return;
    setPickerOpen(true);
    setLoadingMatches(true);
    try {
      const res = await api.matches('WC');
      const all = (res.matches as MatchSummary[]) || [];
      setLiveMatches(all.filter((m) => m.is_live));
    } catch {
      toast.error('Could not load matches');
      setLiveMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  };

  const startRoom = async (matchId: string) => {
    if (!session || !id) return;
    setCreating(true);
    try {
      const room = await api.createRoom(session.access_token, {
        match_id: matchId,
        group_id: id,
      });
      setPickerOpen(false);
      toast.success('Room created!');
      navigate(`/room/${room.room_code as string}/lobby`);
    } catch (e) {
      const msg = e instanceof ApiError && e.data.error === 'match_not_live'
        ? 'That match is no longer live — pick another'
        : e instanceof Error ? e.message : 'Could not create room';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const startDemoRoom = async () => {
    if (!session) return;
    setCreating(true);
    try {
      const room = await api.createRoom(session.access_token, {
        match_source: 'demo_simulation',
        group_id: id,
        bot_config: { enabled: true, count: 3, difficulty: 'medium' },
        phase: 'LOBBY',
      });
      setPickerOpen(false);
      toast.success('Demo room created!');
      navigate(`/room/${room.room_code as string}/lobby`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create demo room');
    } finally {
      setCreating(false);
    }
  };

  if (!data) {
    return (
      <div className="p-8 max-w-lg mx-auto space-y-3">
        <div className="h-8 skeleton w-48" />
        <div className="h-24 skeleton" />
      </div>
    );
  }

  const group = data.group as Record<string, unknown>;
  const board = (data.leaderboard as Record<string, unknown>[]) || [];
  const history = (data.match_history as Record<string, unknown>[]) || [];

  const copyCode = () => {
    navigator.clipboard.writeText(String(group.invite_code));
    toast.success('Invite code copied');
  };

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-start gap-3 mb-4">
        <span className="text-4xl">{String(group.emoji)}</span>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{String(group.name)}</h1>
          <button type="button" onClick={copyCode} className="code text-sm text-[var(--pr-green)] mt-1 bg-transparent border-0 cursor-pointer">
            {String(group.invite_code)} · tap to copy
          </button>
        </div>
      </div>

      <Button variant="primary" fullWidth className="mb-6" onClick={openMatchPicker}>
        Watch Together →
      </Button>

      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Pick a match">
        {loadingMatches ? (
          <div className="space-y-2 py-4">
            <div className="h-14 skeleton" />
            <div className="h-14 skeleton" />
          </div>
        ) : liveMatches.length > 0 ? (
          <div className="space-y-2">
            {liveMatches.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={creating}
                onClick={() => startRoom(m.id)}
                className="surface w-full p-3 flex items-center gap-3 bg-transparent border cursor-pointer text-left"
              >
                <TeamCrest name={m.home_team} logo={m.home_logo} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{m.home_team} vs {m.away_team}</p>
                  <Badge variant="live" dot>LIVE</Badge>
                </div>
                <span className="score text-lg tabular-nums">{m.home_goals}–{m.away_goals}</span>
                <TeamCrest name={m.away_team} logo={m.away_logo} size="sm" />
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-[var(--text-secondary)] mb-4">No live matches right now.</p>
            <Button variant="purple" fullWidth loading={creating} onClick={startDemoRoom}>
              Start demo room instead ⚽
            </Button>
          </div>
        )}
      </BottomSheet>

      <Tabs
        tabs={[
          { id: 'leaderboard' as const, label: 'Leaderboard' },
          { id: 'history' as const, label: 'Match History' },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === 'leaderboard' ? (
        <div className="space-y-2">
          {board.map((m) => {
            const isMe = m.user_id === userId;
            const rank = Number(m.rank);
            return (
              <Card
                key={String(m.user_id)}
                className={`flex items-center gap-3 p-3 ${isMe ? 'table-row-you' : rank === 1 ? 'table-row-gold' : ''}`}
                lift={false}
              >
                <span className="w-6 text-[var(--text-muted)]">{rank === 1 ? '👑' : String(m.rank)}</span>
                <Avatar name={String(m.display_name)} color={String(m.avatar_color)} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{String(m.display_name)}</p>
                  <p className="text-xs text-[var(--text-muted)]">@{String(m.username)}</p>
                </div>
                {rank === 1 && <Badge variant="gold">#1</Badge>}
                <span className="font-bold text-[var(--pr-gold)]">{String(m.group_points)} PP</span>
              </Card>
            );
          })}
        </div>
      ) : history.length === 0 ? (
        <p className="text-center text-[var(--text-muted)] py-8">No group rooms yet</p>
      ) : (
        <div className="space-y-2">
          {history.map((room) => {
            const md = (room.match_data || {}) as Record<string, unknown>;
            const code = String(room.room_code);
            const state = String(room.state);
            const href = state === 'RESULTS' ? `/room/${code}/results` : `/room/${code}/lobby`;
            return (
              <Link key={String(room.id)} to={href} className="no-underline block">
                <Card className="p-3" lift={false}>
                  <p className="font-medium text-sm">
                    {String(md.home_team || 'Home')} vs {String(md.away_team || 'Away')}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="code text-xs text-[var(--text-muted)]">{code}</span>
                    <Badge variant={state === 'LIVE' ? 'live' : 'green'}>{state}</Badge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
