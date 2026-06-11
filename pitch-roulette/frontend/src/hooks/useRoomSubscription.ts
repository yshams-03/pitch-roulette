import { useEffect, useRef, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useGameStore } from '../store/gameStore';
import { usePresence } from './usePresence';
import type { ChatMessage, FlashBet, Player, Sabotage, FantasyScore } from '../../../shared/types';

const BACKOFF_BASE = 1000;
const BACKOFF_MAX = 30000;

export function useRoomSubscription(roomId: string | null) {
  usePresence();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const backoffRef = useRef(BACKOFF_BASE);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    setReconnecting,
    setRoomState,
    setPlayers,
    setSettings,
    setActiveBet,
    appendChatMessage,
    setActiveSabotages,
    setMyFantasyScores,
    setUnderdog,
    setHandicapActive,
    playerId,
  } = useGameStore();

  const subscribe = useCallback(() => {
    if (!supabase || !roomId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const room = payload.new as Record<string, unknown>;
          if (!room) return;
          setRoomState(room.state as import('../../../shared/types').RoomState);
          if (room.settings) setSettings(room.settings as Parameters<typeof setSettings>[0]);
          setUnderdog(
            room.underdog_team as 'A' | 'B' | null,
            Number(room.underdog_multiplier) || 1.0,
          );
          setHandicapActive(Boolean(room.handicap_active));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const store = useGameStore.getState();
            setPlayers(store.players.filter((p) => p.id !== (payload.old as Player).id));
            return;
          }
          const player = payload.new as Player;
          const store = useGameStore.getState();
          const exists = store.players.find((p) => p.id === player.id);
          if (exists) {
            setPlayers(store.players.map((p) => (p.id === player.id ? player : p)));
          } else {
            setPlayers([...store.players, player]);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flash_bets', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const bet = payload.new as FlashBet;
          if (!bet) return;
          if (bet.state === 'FROZEN' || bet.state === 'OPEN') {
            setActiveBet(bet);
          } else if (bet.state === 'CLOSED' || bet.state === 'RESOLVED') {
            const current = useGameStore.getState().activeBet;
            if (current?.id === bet.id) {
              setActiveBet(bet.state === 'RESOLVED' ? null : bet);
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          appendChatMessage(payload.new as ChatMessage);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sabotages', filter: `room_id=eq.${roomId}` },
        () => {
          if (!playerId) return;
          const sessionToken = useGameStore.getState().sessionToken;
          if (!sessionToken) return;
          api.getActiveSabotages(roomId, sessionToken).then((res) => {
            setActiveSabotages(res.sabotages as unknown as Sabotage[]);
          }).catch(() => {});
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fantasy_scores', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (!playerId) return;
          const score = payload.new as FantasyScore;
          if (score?.player_id !== playerId) return;
          const store = useGameStore.getState();
          const exists = store.myFantasyScores.find((s) => s.id === score.id);
          if (exists) {
            setMyFantasyScores(
              store.myFantasyScores.map((s) => (s.id === score.id ? score : s)),
            );
          } else {
            setMyFantasyScores([...store.myFantasyScores, score]);
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setReconnecting(false);
          backoffRef.current = BACKOFF_BASE;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setReconnecting(true);
          scheduleRetry();
        }
      });

    channelRef.current = channel;
  }, [
    roomId,
    playerId,
    setReconnecting,
    setRoomState,
    setPlayers,
    setSettings,
    setActiveBet,
    appendChatMessage,
    setActiveSabotages,
    setMyFantasyScores,
    setUnderdog,
    setHandicapActive,
  ]);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      subscribe();
      backoffRef.current = Math.min(backoffRef.current * 2, BACKOFF_MAX);
    }, backoffRef.current);
  }, [subscribe]);

  useEffect(() => {
    subscribe();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [subscribe]);
}
