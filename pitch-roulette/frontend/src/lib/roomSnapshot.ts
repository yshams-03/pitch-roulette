import type { Room } from '../../../shared/types';

/** Normalize room transition API responses into a Room snapshot. */
export function snapshotFromApi(res: Record<string, unknown>): Room | null {
  if (res.state && res.room_code) {
    return res as unknown as Room;
  }
  const nested = res.room;
  if (nested && typeof nested === 'object' && (nested as Record<string, unknown>).state) {
    return nested as unknown as Room;
  }
  return null;
}
