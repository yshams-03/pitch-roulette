import { useGameStore } from '../store/gameStore';
import { WifiOff } from 'lucide-react';

export function ReconnectBanner() {
  const isReconnecting = useGameStore((s) => s.isReconnecting);
  if (!isReconnecting) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-pitch-amber/90 px-4 py-2 text-sm font-medium text-pitch-black">
      <WifiOff className="h-4 w-4 animate-pulse" />
      Reconnecting...
    </div>
  );
}
