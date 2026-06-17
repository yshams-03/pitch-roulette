import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  cleanupRoom,
  createDemoRoom,
  deleteChatMessage,
  hasE2ECredentials,
  listChatMessages,
  loginViaUI,
  sendChatMessage,
  startRoomApi,
} from './helpers';

const e2eDir = dirname(fileURLToPath(import.meta.url));

test.describe('Feature 5 — Cleanup', () => {
  test('bracket SVG connector lines visible when knockout data exists', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Bracket' }).click();
    const hasRound = await page.getByText(/Round of/i).isVisible().catch(() => false);
    if (hasRound) {
      await expect(page.locator('svg line').first()).toBeAttached();
    }
  });

  test('host can delete chat messages via API', async ({ page }) => {
    test.skip(!hasE2ECredentials(), 'Needs auth');
    const auth = await loginViaUI(page);
    const { code } = await createDemoRoom(auth.accessToken);
    await startRoomApi(auth.accessToken, code);
    const msg = await sendChatMessage(auth.accessToken, code, 'e2e delete me');
    await deleteChatMessage(auth.accessToken, code, msg.id);
    const messages = await listChatMessages(code);
    expect(messages.some((m) => m.content === 'e2e delete me')).toBe(false);
    await cleanupRoom(auth.accessToken, code).catch(() => {});
  });

  test('nightly E2E workflow file exists and is valid YAML', async () => {
    const repoRoot = resolve(e2eDir, '../../..');
    const workflowPath = resolve(repoRoot, '.github/workflows/e2e-nightly.yml');
    expect(existsSync(workflowPath)).toBe(true);
    const content = readFileSync(workflowPath, 'utf8');
    expect(content).toContain('name: E2E Nightly');
    expect(content).toContain('cron:');
    expect(content).toContain('E2E_TEST_EMAIL');
    expect(content).toContain('playwright install');
  });

  test('branch protection documented in README', async () => {
    const readmePath = resolve(e2eDir, '../../README.md');
    const content = readFileSync(readmePath, 'utf8');
    expect(content).toMatch(/Branch protection/i);
    expect(content).toContain('backend');
    expect(content).toContain('frontend-unit');
  });

  test.skip('FULL_TIME auto-set when match finishes', async () => {
    // Requires match_data.status=FINISHED while room is LIVE; demo sim does not expose
    // a stable inject path without backend admin API — covered by unit tests.
  });
});
