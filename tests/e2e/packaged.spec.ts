import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import { launchApp, LaunchedApp, waitForWindow } from './helpers'

/**
 * Smoke test against a real build.
 *
 * The source-tree tests cannot catch packaging mistakes: inside an asar the
 * renderer files live at a different path, and the notification sounds are
 * resolved from `process.resourcesPath` instead of the repository. A wrong
 * `files` or `extraResources` entry only shows up here.
 *
 * Point BLINKBLINK_PACKAGED_PATH at the built executable to enable it, e.g.
 *   npx electron-builder --dir
 *   BLINKBLINK_PACKAGED_PATH=release/linux-unpacked/blinkblink npx playwright test
 */
const executablePath = process.env.BLINKBLINK_PACKAGED_PATH

test.describe('packaged application', () => {
    test.skip(!executablePath, 'Set BLINKBLINK_PACKAGED_PATH to a built executable to run these.')

    let launched: LaunchedApp

    test.beforeAll(() => {
        if (executablePath && !fs.existsSync(executablePath)) {
            throw new Error(`BLINKBLINK_PACKAGED_PATH points at a file that does not exist: ${executablePath}`)
        }
    })

    test.afterEach(async () => {
        await launched?.close()
    })

    test('runs from the package and shows the break overlay', async () => {
        launched = await launchApp({ executablePath, args: ['--take-break'] })
        const overlay = await waitForWindow(launched.app, 'overlay.html')

        expect(await launched.app.evaluate(({ app }) => app.isPackaged)).toBe(true)
        await expect(overlay.locator('#break-view h1')).toContainText('Take A Break')
        await expect(overlay.locator('#skip-button')).toBeVisible()
    })

    test('finds the bundled notification sounds inside the package', async () => {
        launched = await launchApp({ executablePath, args: ['--settings'] })
        const settings = await waitForWindow(launched.app, 'settings.html')

        const sounds = await settings.evaluate(() => window.api.getAvailableSounds())
        expect(sounds.length).toBeGreaterThan(0)

        // The path has to resolve to a real file, or the break-end sound is silent.
        const resolved = await settings.evaluate((name) => window.api.getSoundPath(name), sounds[0].filename)
        expect(resolved).toBeTruthy()
    })

    test('reports its real version and reads settings from the packaged store', async () => {
        launched = await launchApp({ executablePath, args: ['--settings'] })
        const settings = await waitForWindow(launched.app, 'settings.html')

        const info = await settings.evaluate(() => window.api.getAppInfo())
        expect(info.version).toMatch(/^\d+\.\d+\.\d+/)
        expect((await settings.evaluate(() => window.api.getSettings())).workDuration).toBeGreaterThan(0)
    })
})
