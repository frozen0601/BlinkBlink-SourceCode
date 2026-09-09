import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests drive the real Electron app.
 *
 * They are what actually proves the platform-specific window work: the unit
 * tests can say which backdrop mode *should* be chosen, but only a running
 * app can show that the overlay is not painted an opaque white rectangle.
 *
 * On a headless Linux machine, run these under Xvfb (`npm run test:e2e`).
 */
export default defineConfig({
    testDir: './tests/e2e',
    // Electron windows are a shared, single-instance resource.
    workers: 1,
    fullyParallel: false,
    timeout: 60_000,
    expect: { timeout: 15_000 },
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    retries: process.env.CI ? 1 : 0,
    outputDir: './test-results',
})
