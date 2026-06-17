import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

const REACTIONS = ['⚽', '🔥', '😱', '😂', '💀', '🎯'] as const;
const RATE_MS = 2000;

interface FloatEmoji {
  id: number;
  emoji: string;
  x: number;
}

interface Props {
  roomId: string;
  userId: string;
}

export function ReactionOverlay({ roomId, userId }: Props) {
  const [floating, setFloating] = useState<FloatEmoji[]>([]);
  const lastSent = useRef(0);
  const idRef = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const spawn = useCallback((emoji: string, x?: number) => {
    const id = ++idRef.current;
    const pos = x ?? 20 + Math.random() * 60;
    setFloating((prev) => [...prev, { id, emoji, x: pos }]);
    setTimeout(() => {
      setFloating((prev) => prev.filter((f) => f.id !== id));
    }, 2000);
  }, []);

  useEffect(() => {
    if (!supabase || !roomId) return;
    const ch = supabase.channel(`reactions-${roomId}`, { config: { broadcast: { self: true } } });
    ch.on('broadcast', { event: 'reaction' }, ({ payload }) => {
      const p = payload as { emoji?: string; x?: number };
      if (p.emoji) spawn(p.emoji, p.x);
    }).subscribe();
    channelRef.current = ch;
    return () => {
      if (supabase) supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [roomId, spawn]);

  const send = (emoji: string) => {
    const now = Date.now();
    if (now - lastSent.current < RATE_MS) return;
    lastSent.current = now;
    const x = 20 + Math.random() * 60;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'reaction',
      payload: { emoji, x, userId },
    });
    spawn(emoji, x);
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
        {floating.map((f) => (
          <span
            key={f.id}
            className="absolute bottom-24 text-2xl"
            style={{ left: `${f.x}%`, animation: 'float-up 2s ease-out forwards' }}
          >
            {f.emoji}
          </span>
        ))}
      </div>

      <div className="flex justify-center gap-2 py-3">
        {REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => send(e)}
            className="text-xl min-h-10 min-w-10 rounded-lg bg-pitch-card border border-pitch-border hover:bg-pitch-border/50"
          >
            {e}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes float-up {
          0% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-120px); opacity: 0; }
        }
      `}</style>
    </>
  );
}
