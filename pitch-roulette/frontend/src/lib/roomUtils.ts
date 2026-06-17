import type { MatchSource, Room } from '../../../shared/types';

export function inferMatchSource(room: Room | Record<string, unknown> | null | undefined): MatchSource {
  if (!room) return 'live_api';
  const match = room.match_data as { demo?: boolean } | null | undefined;
  // Legacy markers before trusting match_source (DB default can be live_api on demo rows)
  if (match?.demo || room.match_id === 'demo-sandbox') return 'demo_simulation';
  const src = room.match_source as MatchSource | undefined;
  if (src === 'demo_simulation' || src === 'manual') return src;
  return 'live_api';
}

export function isSimulationRoom(room: Room | Record<string, unknown> | null | undefined): boolean {
  const src = inferMatchSource(room);
  return src === 'demo_simulation' || src === 'manual';
}

export function showSimulationBadge(room: Room | Record<string, unknown> | null | undefined): boolean {
  return inferMatchSource(room) === 'demo_simulation';
}
