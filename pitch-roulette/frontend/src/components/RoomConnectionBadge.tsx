import type { ConnectionStatus } from '../hooks/useRoomRealtime';

export function RoomConnectionBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'live') {
    return (
      <span data-testid="realtime-indicator" className="text-xs text-[var(--pr-green)] font-semibold">
        🟢 Live
      </span>
    );
  }
  return (
    <span data-testid="realtime-indicator" className="text-xs text-[var(--pr-gold)] font-semibold">
      ⚠️ Reconnecting
    </span>
  );
}
