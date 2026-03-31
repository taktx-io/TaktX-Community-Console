import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E regression testing
 * Focuses on behavior-based tests to catch regressions without tight coupling to implementation
 */
export default defineConfig({
  testDir: './e2e',

  // Maximum time one test can run
  timeout: 60 * 1000,

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: 'http://localhost:3001',

    // Collect trace when retrying the failed test
    trace: 'retain-on-failure',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Maximum time each action can take
    actionTimeout: 10 * 1000,

    // Maximum time for navigation
    navigationTimeout: 30 * 1000,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run your local dev server and mock API server before starting the tests
  webServer: [
    // Mock API Server (port 8085)
    {
      command: 'node e2e/mocks/server.mjs',
      url: 'http://localhost:8085/health',
      reuseExistingServer: true, // Use existing server if running
      timeout: 30 * 1000,
    },
    // Frontend Dev Server (port 3000) with test environment
    {
      command: 'DOTENV_CONFIG_PATH=.env.test npm run dev',
      url: 'http://localhost:3001',
      reuseExistingServer: true, // Use existing server if running
      timeout: 120 * 1000,
      env: {
        NEXT_PUBLIC_TAKTX_BACKEND_URL: 'http://localhost:8085',
      },
    },
  ],
});

