import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/Avatar';

export function GroupsPage() {
  const { session } = useAuthStore();
  const [groups, setGroups] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (!session) return;
    api.myGroups(session.access_token).then((r) => setGroups(r.groups)).catch(() => toast.error('Failed to load groups'));
  }, [session]);

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-white">My groups</h1>
        <Link to="/groups/create" className="text-sm text-pitch-green">+ Create</Link>
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <Link key={String(g.id)} to={`/groups/${g.id}`}
            className="block rounded-xl border border-pitch-border bg-pitch-card p-4">
            <span className="text-2xl mr-2">{String(g.emoji)}</span>
            <span className="font-semibold text-white">{String(g.name)}</span>
            <p className="text-xs text-pitch-muted mt-1">{String(g.member_count)} members</p>
          </Link>
        ))}
        {groups.length === 0 && <p className="text-pitch-muted text-center py-8">No groups yet</p>}
      </div>
      <Link to="/groups/join" className="block mt-6 text-center min-h-11 leading-[44px] rounded-xl border border-pitch-border">
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
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name"
        className="w-full min-h-11 rounded-xl bg-pitch-card border border-pitch-border px-4 text-white" />
      <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="Emoji"
        className="w-full min-h-11 rounded-xl bg-pitch-card border border-pitch-border px-4 text-white" />
      <button type="button" onClick={create} className="w-full min-h-11 rounded-xl bg-pitch-green text-pitch-black font-bold">
        Create
      </button>
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
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Invite code"
        className="w-full min-h-11 rounded-xl bg-pitch-card border border-pitch-border px-4 font-mono uppercase text-white" />
      <button type="button" onClick={join} className="w-full min-h-11 rounded-xl bg-pitch-green text-pitch-black font-bold">
        Join
      </button>
    </div>
  );
}

export function GroupDetailPage() {
  const { id } = useParams();
  const { session } = useAuthStore();
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!session || !id) return;
    api.groupDetail(session.access_token, id).then(setData).catch(() => toast.error('Failed to load group'));
  }, [session, id]);

  if (!data) return <div className="p-8 text-pitch-muted">Loading...</div>;
  const group = data.group as Record<string, unknown>;
  const board = (data.leaderboard as Record<string, unknown>[]) || [];

  const copyCode = () => {
    navigator.clipboard.writeText(String(group.invite_code));
    toast.success('Invite code copied');
  };

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-2">{String(group.emoji)} {String(group.name)}</h1>
      <button type="button" onClick={copyCode} className="text-sm text-pitch-green mb-6">
        Code: {String(group.invite_code)} (tap to copy)
      </button>
      <h2 className="font-semibold mb-3">Group leaderboard</h2>
      <div className="space-y-2 mb-6">
        {board.map((m) => (
          <div key={String(m.user_id)} className="flex items-center gap-3 rounded-xl bg-pitch-card border border-pitch-border p-3">
            <span className="text-pitch-muted w-6">{String(m.rank)}</span>
            <Avatar name={String(m.display_name)} color={String(m.avatar_color)} />
            <div className="flex-1">
              <p className="font-medium text-white">{String(m.display_name)}</p>
              <p className="text-xs text-pitch-muted">@{String(m.username)}</p>
            </div>
            <span className="font-bold text-pitch-green">{String(m.group_points)} PP</span>
          </div>
        ))}
      </div>
    </div>
  );
}
