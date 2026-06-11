# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: full-game.spec.ts >> Section 8 — Full game loop >> LOBBY → SCOUTING → DRAFT → LIVE → flash bet → RESULTS
- Location: e2e\full-game.spec.ts:46:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Start Draft' })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('button', { name: 'Start Draft' })

```

```yaml
- heading "Pitch Roulette" [level=1]
- paragraph: Real-time football party game. No app. Just a URL.
- button "Create Session"
- button "Join Session"
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import {
  3   |   api,
  4   |   createTwoPlayerGame,
  5   |   sessionInitScript,
  6   |   placeWagerWhenOpen,
  7   | } from './helpers';
  8   | 
  9   | test.describe.configure({ mode: 'serial' });
  10  | 
  11  | test.describe('Section 8 — Full game loop', () => {
  12  |   test('Landing page — create and join flow', async ({ page }) => {
  13  |     await page.goto('/');
  14  |     await expect(page.getByRole('button', { name: 'Create Session' })).toBeVisible();
  15  |     await expect(page.getByRole('button', { name: 'Join Session' })).toBeVisible();
  16  | 
  17  |     await page.getByRole('button', { name: 'Create Session' }).click();
  18  |     await page.getByPlaceholder('Your display name').fill('BrowserHost');
  19  |     await page.getByRole('button', { name: 'Create & Enter Lobby' }).click();
  20  |     await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}\/lobby/, { timeout: 30_000 });
  21  |     const code = await page.getByRole('button').filter({ hasText: /^[A-Z0-9]{6}$/ }).first().innerText();
  22  | 
  23  |     const p2 = await page.context().browser()!.newContext();
  24  |     const p2Page = await p2.newPage();
  25  |     await p2Page.goto('/');
  26  |     await p2Page.getByRole('button', { name: 'Join Session' }).click();
  27  |     await p2Page.getByPlaceholder('Your display name').fill('BrowserP2');
  28  |     await p2Page.getByPlaceholder('ABC123').fill(code);
  29  |     await p2Page.getByRole('button', { name: 'Join Game' }).click();
  30  |     await expect(p2Page).toHaveURL(new RegExp(`/room/${code}/lobby`), { timeout: 30_000 });
  31  |     await p2.close();
  32  |   });
  33  | 
  34  |   test('Non-host blocked from host panel', async ({ browser }) => {
  35  |     const game = await createTwoPlayerGame();
  36  |     const ctx = await browser.newContext();
  37  |     await ctx.addInitScript(sessionInitScript(
  38  |       game.p2Token, game.p2PlayerId, game.code, false,
  39  |     ));
  40  |     const page = await ctx.newPage();
  41  |     await page.goto(`/host/${game.code}`);
  42  |     await expect(page.getByText('Access Denied')).toBeVisible();
  43  |     await ctx.close();
  44  |   });
  45  | 
  46  |   test('LOBBY → SCOUTING → DRAFT → LIVE → flash bet → RESULTS', async ({ browser }) => {
  47  |     const game = await createTwoPlayerGame();
  48  | 
  49  |     const hostContext = await browser.newContext();
  50  |     const p2Context = await browser.newContext();
  51  | 
  52  |     await hostContext.addInitScript(sessionInitScript(
  53  |       game.hostToken, game.hostPlayerId, game.code, true,
  54  |     ));
  55  |     await p2Context.addInitScript(sessionInitScript(
  56  |       game.p2Token, game.p2PlayerId, game.code, false,
  57  |     ));
  58  | 
  59  |     const hostPage = await hostContext.newPage();
  60  |     const p2Page = await p2Context.newPage();
  61  | 
  62  |     await hostPage.goto(`/room/${game.code}/lobby`);
  63  |     await p2Page.goto(`/room/${game.code}/lobby`);
  64  | 
> 65  |     await expect(hostPage.getByRole('button', { name: 'Start Draft' })).toBeVisible();
      |                                                                         ^ Error: expect(locator).toBeVisible() failed
  66  |     await expect(hostPage.getByText('E2EHost')).toBeVisible();
  67  |     await expect(p2Page.getByText('E2EPlayer2')).toBeVisible();
  68  | 
  69  |     await hostPage.getByRole('button', { name: 'Start Draft' }).click();
  70  |     await expect(hostPage).toHaveURL(new RegExp(`/room/${game.code}/scouting`), { timeout: 20_000 });
  71  |     await expect(p2Page).toHaveURL(new RegExp(`/room/${game.code}/scouting`), { timeout: 20_000 });
  72  | 
  73  |     await api(`/rooms/${game.code}/advance-state`, {
  74  |       method: 'POST',
  75  |       body: JSON.stringify({ session_token: game.hostToken }),
  76  |     });
  77  | 
  78  |     await expect(hostPage).toHaveURL(new RegExp(`/room/${game.code}/draft`), { timeout: 20_000 });
  79  |     await expect(p2Page).toHaveURL(new RegExp(`/room/${game.code}/draft`), { timeout: 20_000 });
  80  | 
  81  |     const picks = [
  82  |       { api_player_id: 201, player_name: 'Striker', position: 'Forward' },
  83  |       { api_player_id: 202, player_name: 'Midfielder', position: 'Midfielder' },
  84  |       { api_player_id: 203, player_name: 'Defender', position: 'Defender' },
  85  |     ];
  86  |     await api('/players/fantasy/pick', {
  87  |       method: 'POST',
  88  |       body: JSON.stringify({ session_token: game.hostToken, picks }),
  89  |     });
  90  |     await api('/players/fantasy/pick', {
  91  |       method: 'POST',
  92  |       body: JSON.stringify({ session_token: game.p2Token, picks }),
  93  |     });
  94  | 
  95  |     await api(`/rooms/${game.code}/advance-state`, {
  96  |       method: 'POST',
  97  |       body: JSON.stringify({ session_token: game.hostToken }),
  98  |     });
  99  | 
  100 |     await expect(hostPage).toHaveURL(new RegExp(`/room/${game.code}/live`), { timeout: 20_000 });
  101 |     await expect(p2Page).toHaveURL(new RegExp(`/room/${game.code}/live`), { timeout: 20_000 });
  102 | 
  103 |     const hostBefore = await api<{ balance: number }>(`/players/me?session_token=${game.hostToken}`);
  104 | 
  105 |     const bet = await api<{ id: string }>(`/rooms/${game.code}/manual-flash-bet`, {
  106 |       method: 'POST',
  107 |       body: JSON.stringify({
  108 |         session_token: game.hostToken,
  109 |         bet_type: 'PENALTY',
  110 |         event_label: 'E2E Penalty Bet',
  111 |       }),
  112 |     });
  113 | 
  114 |     const [wagerRes] = await Promise.all([
  115 |       placeWagerWhenOpen(game.roomId, bet.id, game.hostToken, 200, 25_000),
  116 |       expect(p2Page.getByRole('dialog', { name: 'Flash bet' })).toBeVisible({ timeout: 8_000 }).catch(() => {}),
  117 |     ]);
  118 |     expect(wagerRes.new_balance).toBeLessThan(hostBefore.balance);
  119 | 
  120 |     await api('/sabotage/deploy', {
  121 |       method: 'POST',
  122 |       body: JSON.stringify({
  123 |         session_token: game.hostToken,
  124 |         target_player_id: game.p2PlayerId,
  125 |         token_type: 'CHAT_SILENCER',
  126 |       }),
  127 |     });
  128 | 
  129 |     await p2Page.getByRole('button', { name: 'Open trash talk chat' }).click();
  130 |     await expect(p2Page.getByText(/Silenced/i)).toBeVisible({ timeout: 10_000 });
  131 | 
  132 |     await api(`/rooms/${game.code}/advance-state`, {
  133 |       method: 'POST',
  134 |       body: JSON.stringify({ session_token: game.hostToken }),
  135 |     });
  136 |     await api(`/rooms/${game.code}/advance-state`, {
  137 |       method: 'POST',
  138 |       body: JSON.stringify({ session_token: game.hostToken }),
  139 |     });
  140 | 
  141 |     await expect(hostPage).toHaveURL(new RegExp(`/room/${game.code}/results`), { timeout: 20_000 });
  142 |     await expect(p2Page).toHaveURL(new RegExp(`/room/${game.code}/results`), { timeout: 20_000 });
  143 |     await expect(hostPage.getByText('Full Time!')).toBeVisible();
  144 |     await expect(hostPage.getByRole('button', { name: /Share Card/i })).toBeVisible();
  145 | 
  146 |     await hostContext.close();
  147 |     await p2Context.close();
  148 |   });
  149 | });
  150 | 
```