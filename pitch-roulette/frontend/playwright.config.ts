import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, devices } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load frontend/.env so VITE_SUPABASE_* are available to Playwright (Node doesn't use Vite's env). */
function loadDotEnv() {
  const envPath = resolve(__dirname, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/full-game.spec.ts'],
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use installed Google Chrome — avoids `npx playwright install` (TLS issues on some networks)
        channel: 'chrome',
      },
    },
  ],
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: 'npm run dev',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});
