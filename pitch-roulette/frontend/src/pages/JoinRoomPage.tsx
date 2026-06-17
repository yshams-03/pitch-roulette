import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

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
      <h1 className="text-xl font-bold mb-2">Join room</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">Enter the 6-character code from your host</p>
      <Input
        label="Room code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={6}
        className="code uppercase mb-4"
      />
      <Button variant="primary" size="lg" fullWidth onClick={join}>Join</Button>
    </div>
  );
}
