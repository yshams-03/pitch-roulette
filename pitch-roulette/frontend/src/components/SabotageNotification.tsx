import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Sabotage } from '../../../shared/types';

const alertClass: Record<string, string> = {
  JINX: 'sabotage-jinx',
  SILENCE: 'sabotage-silence',
  BLINDFOLD: 'sabotage-blindfold',
  TAX: 'sabotage-tax',
};

interface Props {
  notification: Sabotage & { buyer_name?: string };
  onDismiss: () => void;
}

export function SabotageNotification({ notification, onDismiss }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  if (!visible) return null;

  const who = notification.buyer_name || 'Someone';
  const label = notification.label || notification.sabotage_type;
  const emoji = notification.emoji || '💣';
  const typeClass = alertClass[notification.sabotage_type] || 'sabotage-tax';

  return (
    <motion.div
      data-testid="sabotage-notification"
      className="fixed top-20 left-4 right-4 z-50 mx-auto max-w-sm"
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } }}
      exit={{ opacity: 0, x: 60 }}
    >
      <div className={`rounded-[var(--radius-lg)] px-4 py-3 shadow-lg ${typeClass}`}>
        <p className="text-sm font-semibold">
          {emoji} {who} hit you with {label}!
        </p>
        <button
          type="button"
          onClick={() => { setVisible(false); onDismiss(); }}
          className="text-xs mt-1 underline opacity-80 bg-transparent border-0 cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </motion.div>
  );
}
