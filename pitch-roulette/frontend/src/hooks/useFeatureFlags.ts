import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export type FeatureFlags = {
  sabotage_shop: boolean;
  fantasy_draft: boolean;
  side_assignment: boolean;
  flash_bets: boolean;
  demo_mode: boolean;
};

const DEFAULTS: FeatureFlags = {
  sabotage_shop: true,
  fantasy_draft: true,
  side_assignment: true,
  flash_bets: true,
  demo_mode: false,
};

let cached: FeatureFlags | null = null;

export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>(cached ?? DEFAULTS);

  useEffect(() => {
    if (cached) return;
    api.featureFlags()
      .then((r) => {
        cached = { ...DEFAULTS, ...(r.flags as Partial<FeatureFlags>) };
        setFlags(cached);
      })
      .catch(() => setFlags(DEFAULTS));
  }, []);

  return flags;
}
