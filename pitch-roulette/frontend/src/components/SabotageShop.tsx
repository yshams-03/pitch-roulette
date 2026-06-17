import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';
import { Avatar } from './Avatar';
import type { RoomPlayer, Sabotage, SabotageShopItem } from '../../../shared/types';

interface Props {
  code: string;
  token: string;
  players: RoomPlayer[];
  userId: string;
  sessionPc: number;
  onPurchased: () => void;
}

export function SabotageShop({ code, token, players, userId, sessionPc, onPurchased }: Props) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<SabotageShopItem[]>([]);
  const [balance, setBalance] = useState(sessionPc);
  const [targetingMe, setTargetingMe] = useState<Sabotage[]>([]);
  const [buying, setBuying] = useState<string | null>(null);

  const targets = players.filter((p) => p.user_id !== userId);

  const load = useCallback(async () => {
    try {
      const [shop, active] = await Promise.all([
        api.sabotageShop(token, code),
        api.listSabotages(token, code),
      ]);
      setCatalog((shop.catalog as SabotageShopItem[]) || []);
      setBalance(Math.round(shop.session_pc ?? sessionPc));
      setTargetingMe((active.targeting_me as Sabotage[]) || []);
    } catch {
      /* ignore */
    }
  }, [code, token, sessionPc]);

  useEffect(() => {
    setBalance(sessionPc);
  }, [sessionPc]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const buy = async (type: string, target: RoomPlayer) => {
    const key = `${type}-${target.user_id}`;
    if (buying) return;
    setBuying(key);
    try {
      await api.purchaseSabotage(token, code, type, target.user_id);
      const item = catalog.find((c) => c.type === type);
      toast.success(`💣 ${item?.label || type} sent to ${target.display_name || 'player'}!`);
      setOpen(false);
      onPurchased();
      load();
    } catch (e) {
      const msg = e instanceof ApiError
        ? ({
            insufficient_pc: 'Not enough Pitch Chips',
            cannot_target_self: 'Cannot target yourself',
            room_not_live: 'Shop only open during LIVE',
          }[String(e.data.error)] || e.message)
        : 'Purchase failed';
      toast.error(msg);
    } finally {
      setBuying(null);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="sabotage-shop-btn"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-30 min-h-11 px-4 rounded-full bg-pitch-amber/90 text-pitch-black font-semibold text-sm shadow-lg border border-pitch-amber"
      >
        💣 Shop
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div
            data-testid="sabotage-shop-sheet"
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl bg-pitch-surface border border-pitch-border p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">💣 Sabotage Shop</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-pitch-muted text-sm">Close</button>
            </div>

            <p className="text-sm text-pitch-amber mb-4" data-testid="shop-pc-balance">
              Your balance: 🪙 {balance} PC
            </p>

            {targetingMe.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-xs text-pitch-muted uppercase mb-2">Active on you</p>
                <div className="flex flex-wrap gap-2">
                  {targetingMe.map((s) => (
                    <span key={s.id} className="text-xs px-2 py-1 rounded-full bg-pitch-card text-white">
                      {s.emoji || '💣'} {s.label || s.sabotage_type}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-pitch-muted uppercase mb-2">Pick a target</p>
            <div className="space-y-4">
              {targets.map((target) => (
                <div key={target.user_id} className="rounded-lg border border-pitch-border p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Avatar name={target.display_name || '?'} color={target.avatar_color} size="sm" />
                    <span className="text-sm text-white font-medium">{target.display_name}</span>
                  </div>
                  <div className="grid gap-2">
                    {catalog.map((item) => {
                      const afford = balance >= item.pc_cost;
                      const busy = buying === `${item.type}-${target.user_id}`;
                      return (
                        <button
                          key={`${target.user_id}-${item.type}`}
                          type="button"
                          data-testid={`buy-${item.type}`}
                          disabled={!afford || !!buying}
                          onClick={() => buy(item.type, target)}
                          className={`text-left rounded-lg px-3 py-2 text-sm border transition-colors ${
                            afford
                              ? 'border-pitch-border bg-pitch-card hover:border-pitch-amber text-white'
                              : 'border-pitch-border/50 bg-pitch-card/50 text-pitch-muted cursor-not-allowed'
                          }`}
                        >
                          <span className="font-medium">{item.emoji} {item.label}</span>
                          <span className="text-pitch-amber ml-2">{item.pc_cost} PC</span>
                          <p className="text-xs text-pitch-muted mt-0.5">{item.description}</p>
                          {busy && <span className="text-xs text-pitch-green">Buying…</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {targets.length === 0 && (
              <p className="text-sm text-pitch-muted text-center py-4">No other players to target.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
