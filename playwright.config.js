import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './e2e', timeout: 30000, use: { baseURL: process.env.E2E_URL || 'http://localhost:5173', trace: 'retain-on-failure' }, projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }], workers: 1 });
