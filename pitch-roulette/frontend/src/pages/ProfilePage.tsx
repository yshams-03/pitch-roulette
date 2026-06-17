import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/Avatar';
import type { Profile } from '../../../shared/types';

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

  if (!profile) return <div className="p-8 text-pitch-muted">Loading...</div>;

  const winRate = profile.total_predictions
    ? Math.round((profile.correct_outcomes / profile.total_predictions) * 100)
    : 0;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Avatar name={profile.display_name} color={profile.avatar_color} size="lg" />
        <div>
          <h1 className="text-xl font-bold text-white">{profile.display_name}</h1>
          <p className="text-pitch-muted">@{profile.username}</p>
          {profile.global_rank_percentile != null && (
            <p className="text-xs text-pitch-green mt-1">
              Top {100 - profile.global_rank_percentile}% globally
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          ['Total PP', profile.total_points],
          ['Predictions', profile.total_predictions],
          ['Win rate', `${winRate}%`],
          ['Exact scores', profile.exact_scores],
          ['Streak', profile.current_streak],
          ['Best streak', profile.best_streak],
        ].map(([label, val]) => (
          <div key={String(label)} className="rounded-xl bg-pitch-card border border-pitch-border p-3">
            <p className="text-xs text-pitch-muted">{label}</p>
            <p className="text-lg font-bold text-white">{val}</p>
          </div>
        ))}
      </div>

      <label className="block text-sm text-pitch-muted mb-1">Display name</label>
      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
        className="w-full min-h-11 rounded-xl bg-pitch-card border border-pitch-border px-4 text-white mb-3" />
      <button type="button" onClick={save} className="w-full min-h-11 rounded-xl bg-pitch-green text-pitch-black font-semibold mb-6">
        Save
      </button>

      <button type="button" onClick={() => signOut()} className="w-full min-h-11 rounded-xl border border-pitch-red text-pitch-red">
        Log out
      </button>
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

  if (!profile) return <div className="p-8 text-pitch-muted">Loading...</div>;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Avatar name={String(profile.display_name)} color={String(profile.avatar_color)} size="lg" />
        <div>
          <h1 className="text-xl font-bold">{String(profile.display_name)}</h1>
          <p className="text-pitch-muted">@{String(profile.username)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-pitch-card p-3 border border-pitch-border">
          <p className="text-xs text-pitch-muted">Total PP</p>
          <p className="text-lg font-bold">{String(profile.total_points)}</p>
        </div>
        <div className="rounded-xl bg-pitch-card p-3 border border-pitch-border">
          <p className="text-xs text-pitch-muted">Win rate</p>
          <p className="text-lg font-bold">{String(profile.win_rate)}%</p>
        </div>
      </div>
      <Link to="/leaderboard" className="block mt-6 text-center text-pitch-green text-sm">View leaderboard</Link>
    </div>
  );
}
