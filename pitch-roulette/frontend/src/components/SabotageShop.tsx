import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';
import { Avatar } from './Avatar';
import { BottomSheet } from './ui/BottomSheet';
import { Button } from './ui/Button';
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
  const [expandedTarget, setExpandedTarget] = useState<string | null>(null);

  const targets = players.filter((p) => p.user_id !== userId);
  const canAffordAny = catalog.some((item) => balance >= item.pc_cost);

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
        className={`fixed bottom-24 right-4 z-30 min-h-12 min-w-12 px-4 rounded-full btn-purple font-semibold text-sm shadow-lg ${
          canAffordAny ? 'animate-pulse' : ''
        }`}
      >
        💣 Shop
        {targetingMe.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-[var(--pr-red)] text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {targetingMe.length}
          </span>
        )}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="💣 Sabotage Shop">
        <div data-testid="sabotage-shop-sheet">
          <p className="pc-chip mb-4" data-testid="shop-pc-balance">
            🪙 {balance} PC
          </p>

          {targetingMe.length > 0 && (
            <div className="mb-4 p-3 rounded-[var(--radius-md)] bg-[rgba(255,23,68,0.1)] border border-[rgba(255,23,68,0.25)]">
              <p className="text-xs text-[var(--text-secondary)] uppercase mb-2 font-semibold">Active on you</p>
              <div className="flex flex-wrap gap-2">
                {targetingMe.map((s) => (
                  <span key={s.id} className="badge badge-purple">
                    {s.emoji || '💣'} {s.label || s.sabotage_type}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {targets.map((target) => (
              <div key={target.user_id} className="surface p-3">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full bg-transparent border-0 cursor-pointer p-0"
                  onClick={() => setExpandedTarget(expandedTarget === target.user_id ? null : target.user_id)}
                >
                  <Avatar name={target.display_name || '?'} color={target.avatar_color} size="sm" />
                  <span className="text-sm font-medium flex-1 text-left">{target.display_name}</span>
                  <span className="text-xs text-[var(--text-muted)]">{expandedTarget === target.user_id ? '▲' : '▼'}</span>
                </button>
                {expandedTarget === target.user_id && (
                  <div className="grid gap-2 mt-3">
                    {catalog.map((item) => {
                      const afford = balance >= item.pc_cost;
                      const busy = buying === `${item.type}-${target.user_id}`;
                      return (
                        <div
                          key={`${target.user_id}-${item.type}`}
                          className="flex items-center justify-between gap-2 p-2 rounded-[var(--radius-md)] bg-[var(--bg-overlay)]"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{item.emoji} {item.label}</p>
                            <p className="text-xs text-[var(--text-muted)]">{item.description}</p>
                          </div>
                          <Button
                            variant="purple"
                            size="sm"
                            data-testid={`buy-${item.type}`}
                            disabled={!afford || !!buying}
                            loading={busy}
                            onClick={() => buy(item.type, target)}
                          >
                            {item.pc_cost} 🪙
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {targets.length === 0 && (
            <p className="text-sm text-[var(--text-muted)] text-center py-4">No other players to target.</p>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
