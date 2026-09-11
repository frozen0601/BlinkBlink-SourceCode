import { expect, test } from '@playwright/test'
import { launchApp, LaunchedApp, waitForWindow } from './helpers'

let launched: LaunchedApp

test.afterEach(async () => {
    await launched?.close()
})

test('the settings window renders under a strict CSP in a sandboxed renderer', async () => {
    launched = await launchApp({ args: ['--settings'] })
    const settings = await waitForWindow(launched.app, 'settings.html')

    // The schedule editor is built entirely by settings.js, so seeing seven
    // days proves the extracted script ran with `sandbox: true` and CSP on.
    await expect(settings.locator('.schedule-day')).toHaveCount(7)
    await expect(settings.locator('#workDuration')).toHaveValue('20')
    await expect(settings.locator('#breakDuration')).toHaveValue('20')
    await expect(settings.locator('#reminderStyle')).toBeVisible()
})

test('saved settings survive a round trip through the main process', async () => {
    launched = await launchApp({ args: ['--settings'] })
    const settings = await waitForWindow(launched.app, 'settings.html')

    await settings.locator('#workDuration').fill('35')
    await settings.locator('#workDuration').blur()

    await expect
        .poll(async () => (await settings.evaluate(() => window.api.getSettings())).workDuration, { timeout: 10_000 })
        .toBe(35 * 60 * 1000)
})

test('an out-of-range duration is clamped rather than accepted', async () => {
    launched = await launchApp({ args: ['--settings'] })
    const settings = await waitForWindow(launched.app, 'settings.html')

    // A zero work duration would previously reach the timer and spin the
    // overlay in a tight loop.
    await settings.locator('#workDuration').fill('0')
    await settings.locator('#workDuration').blur()

    await expect.poll(async () => (await settings.evaluate(() => window.api.getSettings())).workDuration, { timeout: 10_000 }).toBe(60_000)
})

test('the schedule editor writes overnight ranges through unchanged', async () => {
    launched = await launchApp({ args: ['--settings'] })
    const settings = await waitForWindow(launched.app, 'settings.html')

    // The schedule editor lives on its own tab, which has to be shown first.
    await settings.locator('.tab-button[data-tab="schedule"]').click()
    await settings.locator('#scheduleEnabled').check()

    const mondayRange = settings.locator('#monday-ranges .time-range').first()
    await mondayRange.locator('.start').fill('22:00')
    await mondayRange.locator('.end').fill('02:00')
    await mondayRange.locator('.end').blur()

    await expect
        .poll(async () => (await settings.evaluate(() => window.api.getSettings())).schedule.monday.timeRanges, { timeout: 10_000 })
        .toEqual([{ start: '22:00', end: '02:00' }])
})
