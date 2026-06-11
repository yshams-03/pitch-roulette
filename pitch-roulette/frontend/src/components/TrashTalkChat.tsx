import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useGameStore } from '../store/gameStore';
import { useFocusTrap } from '../hooks/useFocusTrap';

const EMOJIS = ['⚽', '🔥', '💀', '😂', '🤡', '🧠', '🪓'];

interface TrashTalkChatProps {
  /** Hide / close when a flash bet overlay is active */
  disabled?: boolean;
}

export function TrashTalkChat({ disabled = false }: TrashTalkChatProps) {
  const { sessionToken, chatMessages, activeSabotages } = useGameStore();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const trapRef = useFocusTrap(open, () => setOpen(false));

  const silencer = activeSabotages.find((s) => s.token_type === 'CHAT_SILENCER');
  const silencedUntil = silencer ? new Date(silencer.expires_at).getTime() : 0;
  const isSilenced = silencedUntil > Date.now();

  const [silenceCountdown, setSilenceCountdown] = useState('');
  useEffect(() => {
    if (!isSilenced) return;
    const tick = () => {
      const left = Math.max(0, silencedUntil - Date.now());
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      setSilenceCountdown(`${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isSilenced, silencedUntil]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, open]);

  const handleSend = async () => {
    if (!sessionToken || !input.trim() || isSilenced) return;
    setSending(true);
    try {
      await api.sendChat(sessionToken, input.trim());
      setInput('');
    } catch (e) {
      if (e instanceof ApiError && e.data.error === 'silenced') {
        // handled by UI
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {!disabled && (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-pitch-green text-pitch-black shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label="Open trash talk chat"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            ref={trapRef}
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            className="fixed inset-x-0 bottom-0 z-40 flex h-[50vh] flex-col rounded-t-2xl border-t border-pitch-border bg-pitch-card"
            role="dialog"
            aria-modal="true"
            aria-label="Trash talk chat"
          >
            <div className="flex items-center justify-between border-b border-pitch-border p-3">
              <h3 className="font-medium text-white">Trash Talk</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center text-pitch-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-green"
                aria-label="Close chat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {chatMessages.length === 0 && (
                <p className="text-center text-sm text-pitch-muted">No messages yet. Start the banter!</p>
              )}
              {chatMessages.map((msg, idx) => (
                <div
                  key={msg.id || `${msg.created_at}-${idx}`}
                  className={`text-sm ${msg.is_system ? 'text-pitch-amber italic' : 'text-white'}`}
                >
                  {!msg.is_system && (
                    <span className="font-medium text-pitch-green">{msg.nickname}: </span>
                  )}
                  {msg.content}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-pitch-border p-3">
              {isSilenced ? (
                <p className="text-center text-sm text-pitch-muted">
                  🔇 Silenced for {silenceCountdown}
                </p>
              ) : (
                <>
                  <div className="mb-2 flex gap-1">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setInput((prev) => (prev.length < 200 ? prev + e : prev))}
                        className="flex h-9 min-w-9 items-center justify-center rounded text-lg hover:bg-pitch-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-green"
                        aria-label={`Add ${e} emoji`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value.slice(0, 200))}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder="Talk smack..."
                      maxLength={200}
                      aria-label="Chat message"
                      className="min-h-[44px] flex-1 rounded-lg border border-pitch-border bg-pitch-dark px-3 py-2 text-sm text-white placeholder:text-pitch-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-pitch-green"
                    />
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={sending || !input.trim()}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-pitch-green text-pitch-black disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      aria-label="Send message"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
