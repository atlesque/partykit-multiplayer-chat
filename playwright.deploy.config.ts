import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/deployment',
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8790',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'workers-static-assets',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm generate && pnpm preview:frontend --port 8790',
    url: 'http://127.0.0.1:8790',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
