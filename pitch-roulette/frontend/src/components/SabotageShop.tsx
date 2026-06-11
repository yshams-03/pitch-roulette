import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Skull } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useGameStore } from '../store/gameStore';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { SabotageType } from '../../../shared/types';

const TOKENS: Array<{ type: SabotageType; name: string; cost: number; description: string }> = [
  { type: 'BLINDFOLD', name: 'Blindfold', cost: 150, description: 'Blur scouting for 15 min' },
  { type: 'TAX_COLLECTOR', name: 'Tax Collector', cost: 200, description: 'Siphon 20% of target bet payouts' },
  { type: 'CHAT_SILENCER', name: 'Chat Silencer', cost: 100, description: 'Mute chat for 3 min' },
  { type: 'JINX', name: 'Jinx', cost: 175, description: '75 PC penalty when their player misbehaves' },
  { type: 'MIRROR', name: 'Mirror', cost: 125, description: 'Swap bet labels on their screen' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SabotageShop({ open, onClose }: Props) {
  const { sessionToken, players, playerId, myBalance, activeSabotages } = useGameStore();
  const [deploying, setDeploying] = useState<SabotageType | null>(null);
  const [error, setError] = useState('');
  const trapRef = useFocusTrap(open, onClose);

  const myPlayer = players.find((x) => x.id === playerId);
  const opponents = players.filter(
    (p) => p.id !== playerId && p.assigned_team && p.assigned_team !== myPlayer?.assigned_team,
  );

  const handleDeploy = async (tokenType: SabotageType, targetId: string) => {
    if (!sessionToken) return;
    setError('');
    try {
      await api.deploySabotage(sessionToken, tokenType, targetId);
      setDeploying(null);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        const err = e.data.error as string;
        if (err === 'cannot_target_teammate') {
          setError('Cannot target a teammate — pick an opponent');
        } else if (err === 'insufficient_balance') {
          setError('Not enough PC for this token');
        } else {
          setError(err || 'Deploy failed');
        }
      }
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-pitch-black/60"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={trapRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-pitch-border bg-pitch-card p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Sabotage shop"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skull className="h-5 w-5 text-pitch-red" aria-hidden />
                <h2 className="text-lg font-bold text-white">Sabotage Shop</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center text-pitch-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-green"
                aria-label="Close sabotage shop"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {activeSabotages.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {activeSabotages.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-full bg-pitch-red/20 px-3 py-1 text-xs text-pitch-red"
                  >
                    {s.token_type.replace('_', ' ')} active
                  </span>
                ))}
              </div>
            )}

            {error && <p className="mb-3 text-sm text-pitch-red">{error}</p>}

            {opponents.length === 0 && (
              <p className="mb-3 text-sm text-pitch-muted">
                No opponents available — need players on the other team.
              </p>
            )}

            <div className="space-y-3">
              {TOKENS.map((token) => {
                const canAfford = myBalance >= token.cost;
                const canDeploy = canAfford && opponents.length > 0;
                return (
                  <div
                    key={token.type}
                    className={`rounded-xl border border-pitch-border p-4 ${!canAfford ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium text-white">{token.name}</h3>
                        <p className="text-xs text-pitch-muted">{token.description}</p>
                      </div>
                      <span className="font-mono text-sm text-pitch-amber">{token.cost} PC</span>
                    </div>
                    {deploying === token.type ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-pitch-muted">Select target:</p>
                        {opponents.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleDeploy(token.type, p.id)}
                            className="min-h-[44px] w-full rounded-lg bg-pitch-dark py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-green"
                          >
                            {p.nickname}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setDeploying(null)}
                          className="min-h-[44px] w-full text-xs text-pitch-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!canDeploy}
                        onClick={() => setDeploying(token.type)}
                        className="mt-3 min-h-[44px] w-full rounded-lg bg-pitch-red py-2 text-sm font-medium text-white disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-amber"
                      >
                        Deploy
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
