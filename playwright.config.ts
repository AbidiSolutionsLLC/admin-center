import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,  // Set to false for headed mode: `--headed`
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',  // Optional: captures video on failure
  },
  projects: [
    // Setup project for authentication (runs once before all projects)
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    
    
    
    // Microsoft Edge
    {
      name: 'msedge',
      use: { 
        ...devices['Desktop Edge'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
});