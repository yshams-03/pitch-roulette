import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlashBetCard } from './FlashBetCard';
import type { FlashBet } from '../../../shared/types';

vi.mock('../lib/api', () => ({
  api: { flashBetResults: vi.fn().mockResolvedValue({ answers: [] }) },
  ApiError: class extends Error {},
}));

const bet: FlashBet = {
  id: 'bet-1',
  room_id: 'room-1',
  triggered_by: 'HOST',
  question: 'Goal next?',
  options: ['Yes', 'No'],
  correct_option: null,
  wager_tier: 'MEDIUM',
  wager_amount: 10,
  state: 'OPEN',
  opens_at: new Date().toISOString(),
  locks_at: new Date(Date.now() + 30_000).toISOString(),
  resolved_at: null,
  match_event_type: null,
  created_at: new Date().toISOString(),
};

describe('FlashBetCard blindfold', () => {
  it('shows ??? for options when blindfolded', () => {
    render(
      <FlashBetCard
        bet={bet}
        code="TEST01"
        token="tok"
        blindfolded
        onAnswered={() => {}}
      />,
    );
    const buttons = screen.getAllByText('???');
    expect(buttons.length).toBe(2);
  });

  it('shows real options when not blindfolded', () => {
    render(
      <FlashBetCard
        bet={bet}
        code="TEST01"
        token="tok"
        onAnswered={() => {}}
      />,
    );
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
  });
});
