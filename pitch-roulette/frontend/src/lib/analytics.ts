import { api } from './api';

type EventProps = Record<string, string | number | boolean | null | undefined>;

let tokenProvider: (() => string | null) | null = null;

/** Register auth token source (call once from App after auth hydrates). */
export function setAnalyticsTokenProvider(fn: () => string | null) {
  tokenProvider = fn;
}

export function trackPageView(path: string) {
  trackEvent('page_view', { path });
}

export function trackEvent(name: string, properties: EventProps = {}) {
  const token = tokenProvider?.();
  if (!token) return;
  void api.trackEvent(token, name, properties).catch(() => {});
}
