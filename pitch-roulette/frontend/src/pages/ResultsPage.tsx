import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { useRoomSubscription } from '../hooks/useRoomSubscription';
import { PostMatchBreakdown } from '../components/PostMatchBreakdown';
import { ReconnectBanner } from '../components/ReconnectBanner';

export function ResultsPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { roomId, roomState } = useGameStore();

  useRoomSubscription(roomId);

  useEffect(() => {
    if (roomState === 'LOBBY') navigate(`/room/${code}/lobby`);
    else if (roomState === 'LIVE') navigate(`/room/${code}/live`);
  }, [roomState, code, navigate]);

  return (
    <div className="min-h-screen bg-pitch-black">
      <ReconnectBanner />
      <PostMatchBreakdown
        onRematch={(newCode) => navigate(`/room/${newCode}/lobby`)}
      />
    </div>
  );
}
