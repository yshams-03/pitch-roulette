import { useEffect, useState } from 'react';
import type { Sabotage } from '../../../shared/types';

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
    }, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  if (!visible) return null;

  const who = notification.buyer_name || 'Someone';
  const label = notification.label || notification.sabotage_type;
  const emoji = notification.emoji || '💣';

  return (
    <div
      data-testid="sabotage-notification"
      className="fixed top-20 left-4 right-4 z-50 mx-auto max-w-sm animate-in slide-in-from-top duration-300"
    >
      <div className="rounded-xl bg-red-600/95 border border-red-400 px-4 py-3 text-white shadow-lg">
        <p className="text-sm font-semibold">
          {emoji} {who} hit you with {label}!
        </p>
        <button
          type="button"
          onClick={() => { setVisible(false); onDismiss(); }}
          className="text-xs text-red-100 mt-1 underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
