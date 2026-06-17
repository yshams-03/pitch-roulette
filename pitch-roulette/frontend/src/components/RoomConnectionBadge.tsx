import type { ConnectionStatus } from '../hooks/useRoomRealtime';

export function RoomConnectionBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'live') {
    return <span className="text-xs text-pitch-green">🟢 Live</span>;
  }
  return (
    <span className="text-xs text-pitch-amber">
      ⚠️ Connection lost, reconnecting…
    </span>
  );
}
