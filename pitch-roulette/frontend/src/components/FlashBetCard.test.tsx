import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FlashBetCard } from '../components/FlashBetCard';
import type { FlashBet } from '../../../shared/types';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: {
    answerFlashBet: vi.fn().mockResolvedValue({}),
    flashBetResults: vi.fn().mockResolvedValue({ answers: [] }),
  },
  ApiError: class ApiError extends Error {
    status = 400;
    data = {};
  },
}));

const openBet: FlashBet = {
  id: 'bet-1',
  room_id: 'room-1',
  triggered_by: 'AUTO',
  question: 'Next goal within 10 minutes?',
  options: ['Yes', 'No'],
  correct_option: null,
  wager_tier: 'MEDIUM',
  wager_amount: 1,
  state: 'OPEN',
  opens_at: new Date(Date.now() - 5000).toISOString(),
  locks_at: new Date(Date.now() + 25_000).toISOString(),
  resolved_at: null,
  match_event_type: 'GOAL',
  created_at: new Date().toISOString(),
};

describe('FlashBetCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders question and Yes/No buttons', () => {
    render(
      <FlashBetCard
        bet={openBet}
        code="TEST01"
        token="tok"
        onAnswered={() => {}}
      />,
    );
    expect(screen.getByText(openBet.question)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
  });

  it('shows optimistic pick immediately on click', async () => {
    const { api } = await import('../lib/api');
    vi.mocked(api.answerFlashBet).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({}), 200)),
    );

    render(
      <FlashBetCard
        bet={openBet}
        code="TEST01"
        token="tok"
        onAnswered={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => {
      expect(screen.getByText(/Your pick: Yes/i)).toBeInTheDocument();
    });
  });
});
