import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useGameStore } from '../store/gameStore';

interface Props {
  onDismiss: () => void;
}

export function TeamAssignmentReveal({ onDismiss }: Props) {
  const {
    myTeam,
    teamAName,
    teamBName,
    underdogTeam,
    underdogMultiplier,
    sessionToken,
    settings,
    players,
  } = useGameStore();

  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');

  if (!myTeam) return null;

  const teamName = myTeam === 'A' ? teamAName : teamBName;
  const teamColor = myTeam === 'A' ? '#3B82F6' : '#EF4444';
  const isUnderdog = underdogTeam === myTeam;
  const lobbySize = players.length;
  const penalty = settings.custom_switch_penalty
    ? Math.max(50, Math.min(500, settings.custom_switch_penalty))
    : lobbySize <= 4 ? 250 : lobbySize <= 8 ? 200 : lobbySize <= 16 ? 150 : 100;

  const handleSwitch = async () => {
    if (!sessionToken) return;
    setSwitching(true);
    setError('');
    try {
      await api.switchTeam(sessionToken);
      setConfirming(false);
      onDismiss();
    } catch (e) {
      if (e instanceof ApiError) {
        setError((e.data.error as string) || 'Switch failed');
      }
    } finally {
      setSwitching(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-pitch-black/95 p-4"
      >
        <motion.div
          initial={{ scale: 0.5, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="w-full max-w-sm text-center"
        >
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <p className="mb-2 text-sm uppercase tracking-widest text-pitch-muted">You are on</p>
            <div
              className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full text-4xl font-bold text-white shadow-lg"
              style={{ backgroundColor: teamColor }}
            >
              {myTeam}
            </div>
            <h2 className="mb-2 text-2xl font-bold text-white">{teamName}</h2>

            {isUnderdog && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
                className="mb-4 inline-block rounded-full bg-pitch-amber px-4 py-1 text-sm font-bold text-pitch-black"
              >
                Underdog {underdogMultiplier}x multiplier
              </motion.div>
            )}

            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={onDismiss}
                className="w-full rounded-xl bg-pitch-green py-3 font-semibold text-pitch-black"
              >
                Let's Go!
              </button>

              {settings.allow_switching && !confirming && (
                <button
                  onClick={() => setConfirming(true)}
                  className="w-full rounded-xl border border-pitch-border py-3 text-sm text-pitch-muted"
                >
                  Switch Team (−{penalty} PC)
                </button>
              )}

              {confirming && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                  <p className="text-sm text-pitch-amber">
                    Switching costs {penalty} PC. This cannot be undone.
                  </p>
                  {error && <p className="text-sm text-pitch-red">{error}</p>}
                  <button
                    onClick={handleSwitch}
                    disabled={switching}
                    className="w-full rounded-xl bg-pitch-red py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {switching ? 'Switching...' : 'Confirm Switch'}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="w-full text-sm text-pitch-muted"
                  >
                    Cancel
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
