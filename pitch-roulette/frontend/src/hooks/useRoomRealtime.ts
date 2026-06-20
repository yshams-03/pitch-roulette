import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { Prediction, Room, RoomPlayer } from '../../../shared/types';

const POLL_CONNECTED_MS = 10_000;
const POLL_DISCONNECTED_MS = 1_000;

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

  const applySnapshot = useCallback((snapshot: Room | Record<string, unknown>) => {
    setRoom(snapshot as Room);
  }, []);

  const patchRoom = useCallback((patch: Partial<Room>) => {
    setRoom((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!roomCode || !supabase) return;

    const codeUpper = roomCode.toUpperCase();
    let cancelled = false;

    const stopPoll = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const startPoll = (ms: number) => {
      stopPoll();
      pollRef.current = setInterval(load, ms);
    };

    startPoll(POLL_DISCONNECTED_MS);

    const channel = supabase.channel(`room-rt-${codeUpper}`);

    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_code=eq.${codeUpper}` },
      () => {
        load();
      },
    );

    const roomId = room?.id;
    if (roomId) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        () => load(),
      );
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'predictions', filter: `room_id=eq.${roomId}` },
        () => load(),
      );
    }

    channel.subscribe((subStatus) => {
      if (cancelled) return;
      if (subStatus === 'SUBSCRIBED') {
        setStatus('live');
        startPoll(POLL_CONNECTED_MS);
        load();
      } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
        setStatus('reconnecting');
        startPoll(POLL_DISCONNECTED_MS);
      } else if (subStatus === 'CLOSED') {
        setStatus('reconnecting');
        startPoll(POLL_DISCONNECTED_MS);
      }
    });

    return () => {
      cancelled = true;
      stopPoll();
      supabase.removeChannel(channel);
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
    applySnapshot,
    patchRoom,
  };
}
