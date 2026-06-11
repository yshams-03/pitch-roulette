import { test, expect } from '@playwright/test';
import {
  api,
  createTwoPlayerGame,
  sessionInitScript,
  placeWagerWhenOpen,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Section 8 — Full game loop', () => {
  test('Landing page — create and join flow', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Create Session' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join Session' })).toBeVisible();

    await page.getByRole('button', { name: 'Create Session' }).click();
    await page.getByPlaceholder('Your display name').fill('BrowserHost');
    await page.getByRole('button', { name: 'Create & Enter Lobby' }).click();
    await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}\/lobby/, { timeout: 30_000 });
    const code = await page.getByRole('button').filter({ hasText: /^[A-Z0-9]{6}$/ }).first().innerText();

    const p2 = await page.context().browser()!.newContext();
    const p2Page = await p2.newPage();
    await p2Page.goto('/');
    await p2Page.getByRole('button', { name: 'Join Session' }).click();
    await p2Page.getByPlaceholder('Your display name').fill('BrowserP2');
    await p2Page.getByPlaceholder('ABC123').fill(code);
    await p2Page.getByRole('button', { name: 'Join Game' }).click();
    await expect(p2Page).toHaveURL(new RegExp(`/room/${code}/lobby`), { timeout: 30_000 });
    await p2.close();
  });

  test('Non-host blocked from host panel', async ({ browser }) => {
    const game = await createTwoPlayerGame();
    const ctx = await browser.newContext();
    await ctx.addInitScript(sessionInitScript(
      game.p2Token, game.p2PlayerId, game.code, false,
    ));
    const page = await ctx.newPage();
    await page.goto(`/host/${game.code}`);
    await expect(page.getByText('Access Denied')).toBeVisible();
    await ctx.close();
  });

  test('LOBBY → SCOUTING → DRAFT → LIVE → flash bet → RESULTS', async ({ browser }) => {
    const game = await createTwoPlayerGame();

    const hostContext = await browser.newContext();
    const p2Context = await browser.newContext();

    await hostContext.addInitScript(sessionInitScript(
      game.hostToken, game.hostPlayerId, game.code, true,
    ));
    await p2Context.addInitScript(sessionInitScript(
      game.p2Token, game.p2PlayerId, game.code, false,
    ));

    const hostPage = await hostContext.newPage();
    const p2Page = await p2Context.newPage();

    await hostPage.goto(`/room/${game.code}/lobby`);
    await p2Page.goto(`/room/${game.code}/lobby`);

    await expect(hostPage.getByRole('button', { name: 'Start Draft' })).toBeVisible();
    await expect(hostPage.getByText('E2EHost')).toBeVisible();
    await expect(p2Page.getByText('E2EPlayer2')).toBeVisible();

    await hostPage.getByRole('button', { name: 'Start Draft' }).click();
    await expect(hostPage).toHaveURL(new RegExp(`/room/${game.code}/scouting`), { timeout: 20_000 });
    await expect(p2Page).toHaveURL(new RegExp(`/room/${game.code}/scouting`), { timeout: 20_000 });

    await api(`/rooms/${game.code}/advance-state`, {
      method: 'POST',
      body: JSON.stringify({ session_token: game.hostToken }),
    });

    await expect(hostPage).toHaveURL(new RegExp(`/room/${game.code}/draft`), { timeout: 20_000 });
    await expect(p2Page).toHaveURL(new RegExp(`/room/${game.code}/draft`), { timeout: 20_000 });

    const picks = [
      { api_player_id: 201, player_name: 'Striker', position: 'Forward' },
      { api_player_id: 202, player_name: 'Midfielder', position: 'Midfielder' },
      { api_player_id: 203, player_name: 'Defender', position: 'Defender' },
    ];
    await api('/players/fantasy/pick', {
      method: 'POST',
      body: JSON.stringify({ session_token: game.hostToken, picks }),
    });
    await api('/players/fantasy/pick', {
      method: 'POST',
      body: JSON.stringify({ session_token: game.p2Token, picks }),
    });

    await api(`/rooms/${game.code}/advance-state`, {
      method: 'POST',
      body: JSON.stringify({ session_token: game.hostToken }),
    });

    await expect(hostPage).toHaveURL(new RegExp(`/room/${game.code}/live`), { timeout: 20_000 });
    await expect(p2Page).toHaveURL(new RegExp(`/room/${game.code}/live`), { timeout: 20_000 });

    const hostBefore = await api<{ balance: number }>(`/players/me?session_token=${game.hostToken}`);

    const bet = await api<{ id: string }>(`/rooms/${game.code}/manual-flash-bet`, {
      method: 'POST',
      body: JSON.stringify({
        session_token: game.hostToken,
        bet_type: 'PENALTY',
        event_label: 'E2E Penalty Bet',
      }),
    });

    const [wagerRes] = await Promise.all([
      placeWagerWhenOpen(game.roomId, bet.id, game.hostToken, 200, 25_000),
      expect(p2Page.getByRole('dialog', { name: 'Flash bet' })).toBeVisible({ timeout: 8_000 }).catch(() => {}),
    ]);
    expect(wagerRes.new_balance).toBeLessThan(hostBefore.balance);

    await api('/sabotage/deploy', {
      method: 'POST',
      body: JSON.stringify({
        session_token: game.hostToken,
        target_player_id: game.p2PlayerId,
        token_type: 'CHAT_SILENCER',
      }),
    });

    await p2Page.getByRole('button', { name: 'Open trash talk chat' }).click();
    await expect(p2Page.getByText(/Silenced/i)).toBeVisible({ timeout: 10_000 });

    await api(`/rooms/${game.code}/advance-state`, {
      method: 'POST',
      body: JSON.stringify({ session_token: game.hostToken }),
    });
    await api(`/rooms/${game.code}/advance-state`, {
      method: 'POST',
      body: JSON.stringify({ session_token: game.hostToken }),
    });

    await expect(hostPage).toHaveURL(new RegExp(`/room/${game.code}/results`), { timeout: 20_000 });
    await expect(p2Page).toHaveURL(new RegExp(`/room/${game.code}/results`), { timeout: 20_000 });
    await expect(hostPage.getByText('Full Time!')).toBeVisible();
    await expect(hostPage.getByRole('button', { name: /Share Card/i })).toBeVisible();

    await hostContext.close();
    await p2Context.close();
  });
});
