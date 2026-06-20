import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import type { Profile } from '../../../shared/types';

function StatCard({ label, value, gold = false }: { label: string; value: string | number; gold?: boolean }) {
  return (
    <Card className="p-3 text-center" lift={false}>
      <p className={`score text-2xl ${gold ? 'text-[var(--pr-gold)]' : ''}`}>{value}</p>
      <p className="text-xs text-[var(--text-secondary)] mt-1">{label}</p>
    </Card>
  );
}

export function ProfilePage() {
  const { session, signOut, setProfile } = useAuthStore();
  const [profile, setLocal] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (!session) return;
    api.myProfile(session.access_token).then((p) => {
      const prof = p as unknown as Profile;
      setLocal(prof);
      setProfile(prof);
      setDisplayName(prof.display_name);
    }).catch(() => toast.error('Failed to load profile'));
  }, [session, setProfile]);

  const save = async () => {
    if (!session) return;
    await api.updateProfile(session.access_token, displayName);
    toast.success('Profile updated');
  };

  const handleLogout = async () => {
    await signOut();
  };

  if (!profile) {
    return (
      <div className="p-8 max-w-lg mx-auto space-y-3">
        <div className="h-20 skeleton rounded-full w-20 mx-auto" />
        <div className="h-32 skeleton" />
      </div>
    );
  }

  const winRate = profile.total_predictions
    ? Math.round((profile.correct_outcomes / profile.total_predictions) * 100)
    : 0;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex flex-col items-center text-center mb-8">
        <Avatar name={profile.display_name} color={profile.avatar_color} size="xl" />
        <h1 className="text-xl font-bold mt-4">{profile.display_name}</h1>
        <p className="text-[var(--text-secondary)]">@{profile.username}</p>
        {profile.global_rank_percentile != null && (
          <p className="text-xs text-[var(--pr-green)] mt-1">
            Top {100 - profile.global_rank_percentile}% globally
          </p>
        )}
        <Button variant="ghost" size="sm" className="mt-3">Edit profile</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        <StatCard label="Total PP" value={profile.total_points} gold />
        <StatCard label="Predictions" value={profile.total_predictions} />
        <StatCard label="Correct %" value={`${winRate}%`} />
        <StatCard label="Exact Scores" value={profile.exact_scores} />
        <StatCard label="Current Streak 🔥" value={profile.current_streak} />
        <StatCard label="Best Streak" value={profile.best_streak} />
      </div>

      <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mb-3" />
      <Button variant="primary" fullWidth onClick={save} className="mb-4">Save</Button>
      <Button variant="danger" fullWidth onClick={handleLogout}>Log out</Button>
    </div>
  );
}

export function PublicProfilePage() {
  const { username = '' } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!username) return;
    api.publicProfile(username).then(setProfile).catch(() => toast.error('User not found'));
  }, [username]);

  if (!profile) return <div className="p-8 text-[var(--text-muted)]">Loading...</div>;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex flex-col items-center text-center mb-8">
        <Avatar name={String(profile.display_name)} color={String(profile.avatar_color)} size="xl" />
        <h1 className="text-xl font-bold mt-4">{String(profile.display_name)}</h1>
        <p className="text-[var(--text-secondary)]">@{String(profile.username)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total PP" value={String(profile.total_points)} gold />
        <StatCard label="Win rate" value={`${String(profile.win_rate)}%`} />
      </div>
      <Link to="/leaderboard" className="block mt-6 text-center text-[var(--pr-green)] text-sm">View leaderboard</Link>
    </div>
  );
}
