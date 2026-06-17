import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { Prediction, Room, RoomPlayer } from '../../../shared/types';

const FALLBACK_POLL_MS = 5000;

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting';

export function useRoomRealtime(roomCode: string | undefined) {
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!roomCode) return;
    try {
      const r = await api.getRoom(roomCode);
      setRoom(r as unknown as Room);
    } catch {
      /* keep last snapshot */
    }
  }, [roomCode]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!roomCode || !supabase || !room?.id) return;

    const roomId = room.id;
    let cancelled = false;

    const stopPoll = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const startPoll = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(load, FALLBACK_POLL_MS);
    };

    const channel = supabase
      .channel(`room-rt-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'predictions', filter: `room_id=eq.${roomId}` },
        () => load(),
      )
      .subscribe((subStatus) => {
        if (cancelled) return;
        if (subStatus === 'SUBSCRIBED') {
          setStatus('live');
          stopPoll();
        } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
          setStatus('reconnecting');
          startPoll();
        } else if (subStatus === 'CLOSED') {
          setStatus('reconnecting');
          startPoll();
        }
      });

    return () => {
      cancelled = true;
      stopPoll();
      if (supabase) supabase.removeChannel(channel);
    };
  }, [room?.id, roomCode, load]);

  const players = (room?.players || []) as RoomPlayer[];
  const predictions = (room?.predictions || []) as Prediction[];

  return {
    room,
    players,
    predictions,
    isConnected: status === 'live',
    connectionStatus: status,
    refresh: load,
  };
}
