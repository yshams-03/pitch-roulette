import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export function JoinRoomPage() {
  const [code, setCode] = useState('');
  const { session } = useAuthStore();
  const navigate = useNavigate();

  const join = async () => {
    if (!session) {
      navigate('/auth/login');
      return;
    }
    try {
      const room = await api.joinRoom(session.access_token, code.toUpperCase());
      const state = room.state as string;
      if (state === 'PREDICTING') navigate(`/room/${code}/predict`);
      else if (state === 'RESULTS') navigate(`/room/${code}/results`);
      else navigate(`/room/${code}/lobby`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not join');
    }
  };

  return (
    <div className="px-4 py-8 max-w-sm mx-auto">
      <h1 className="text-xl font-bold mb-4">Join room</h1>
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6}
        placeholder="Room code" className="w-full min-h-11 rounded-xl bg-pitch-card border border-pitch-border px-4 font-mono uppercase text-white mb-4" />
      <button type="button" onClick={join} className="w-full min-h-11 rounded-xl bg-pitch-green text-pitch-black font-bold">
        Join
      </button>
    </div>
  );
}
