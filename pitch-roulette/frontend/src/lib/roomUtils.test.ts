import { describe, expect, it } from 'vitest';
import { inferMatchSource, isSimulationRoom, showSimulationBadge } from '../lib/roomUtils';

describe('roomUtils', () => {
  it('infers demo_simulation from match_source', () => {
    expect(inferMatchSource({ match_source: 'demo_simulation', match_id: 'x' })).toBe('demo_simulation');
  });

  it('infers legacy demo from match_id', () => {
    expect(inferMatchSource({ match_id: 'demo-sandbox' })).toBe('demo_simulation');
  });

  it('defaults to live_api', () => {
    expect(inferMatchSource({ match_id: '123' })).toBe('live_api');
  });

  it('isSimulationRoom for demo', () => {
    expect(isSimulationRoom({ match_source: 'demo_simulation' })).toBe(true);
    expect(isSimulationRoom({ match_source: 'live_api' })).toBe(false);
  });

  it('prefers legacy demo markers over match_source live_api', () => {
    expect(inferMatchSource({ match_source: 'live_api', match_id: 'demo-sandbox' })).toBe('demo_simulation');
    expect(showSimulationBadge({ match_source: 'live_api', match_id: 'demo-sandbox' })).toBe(true);
  });

  it('showSimulationBadge only for demo_simulation', () => {
    expect(showSimulationBadge({ match_source: 'demo_simulation' })).toBe(true);
    expect(showSimulationBadge({ match_source: 'manual' })).toBe(false);
  });
});
