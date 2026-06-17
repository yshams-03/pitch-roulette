import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { RoomMessage } from '../../../shared/types';

interface Props {
  roomId: string;
  code: string;
  token: string;
  enabled: boolean;
}

export function RoomChat({ roomId, code, token, enabled }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (before?: string) => {
    const r = await api.roomMessages(code, before);
    const batch = (r.messages as unknown as RoomMessage[]) || [];
    if (before) {
      setMessages((prev) => [...batch, ...prev]);
    } else {
      setMessages(batch);
    }
    return batch;
  }, [code]);

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled, load]);

  useEffect(() => {
    if (!supabase || !roomId || !enabled) return;
    const ch = supabase
      .channel(`chat-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const msg = payload.new as RoomMessage;
          if (!msg.is_deleted) {
            setMessages((prev) => [...prev, msg]);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const msg = payload.new as RoomMessage;
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
        },
      )
      .subscribe();
    return () => { if (supabase) supabase.removeChannel(ch); };
  }, [roomId, enabled]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !enabled) return;
    setDraft('');
    try {
      await api.sendMessage(token, code, text);
    } catch {
      setDraft(text);
    }
  };

  const loadOlder = async () => {
    if (!messages.length || loadingMore) return;
    setLoadingMore(true);
    await load(messages[0].sent_at);
    setLoadingMore(false);
  };

  return (
    <div className="ui-surface mt-4" data-testid="room-chat" data-chat-enabled={enabled ? 'true' : 'false'}>
      <button
        type="button"
        data-testid="chat-expand"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-white"
      >
        <span className="flex items-center gap-2">
          Chat
          {!enabled && (
            <span className="text-[10px] uppercase tracking-wide text-pitch-muted">Off</span>
          )}
        </span>
        <span className="text-pitch-muted">{open ? '▼' : '▶'}</span>
      </button>

      {!enabled && (
        <p data-testid="chat-disabled" role="status" className="px-3 pb-2 text-xs text-pitch-muted text-center">
          Chat disabled by host
        </p>
      )}

      {open && (
        <div className="border-t border-pitch-border px-3 pb-3">
          <div className="max-h-48 overflow-y-auto space-y-2 py-2">
            {messages.length > 0 && (
              <button type="button" onClick={loadOlder} className="text-xs text-pitch-muted w-full text-left">
                {loadingMore ? 'Loading…' : 'Load older'}
              </button>
            )}
            {messages.map((m) => (
              <div key={m.id} className="text-xs">
                <span className="text-pitch-green font-medium">{m.username}</span>
                <span className="text-pitch-muted ml-1">
                  {new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <p className="text-white break-words">
                  {m.is_deleted ? <em className="text-pitch-muted">message removed</em> : m.content}
                </p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          {enabled && (
            <div className="flex gap-2">
              <input
                data-testid="chat-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 200))}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Message…"
                className="flex-1 min-h-9 rounded-lg bg-pitch-card border border-pitch-border px-2 text-sm text-white"
              />
              <button type="button" onClick={send} className="ui-btn ui-btn-primary min-h-9 px-3 text-sm">
                Send
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
