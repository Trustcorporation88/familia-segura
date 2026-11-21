import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 390, height: 844 }, locale: 'pt-BR', serviceWorkers: 'block', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
})
