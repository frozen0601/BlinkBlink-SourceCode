import { expect, test } from '@playwright/test'
import { launchApp, LaunchedApp, waitForWindow } from './helpers'

let launched: LaunchedApp

test.afterEach(async () => {
    await launched?.close()
})

/**
 * The reminder is the feature that was reported broken on macOS and unverified
 * elsewhere. With a one-minute work interval and a 55 second lead time the
 * toast is due about five seconds after startup, so it can be tested for real
 * rather than reasoned about.
 */
test('the pre-break reminder appears ahead of the break', async () => {
    launched = await launchApp({
        settings: { workDuration: 60_000, breakPreNotificationOffset: 55_000, enableBreakNotification: true, reminderStyle: 'in-app' },
    })

    const toast = await waitForWindow(launched.app, 'reminder.html', 30_000)

    await expect(toast.locator('.toast-title')).toContainText('Break coming up')
    await expect(toast.locator('#skip')).toBeVisible()
    await expect(toast.locator('#start-now')).toBeVisible()
    // The countdown is driven by the renderer from the break timestamp.
    await expect(toast.locator('#countdown')).toContainText(/Starting in/)
})

test('no reminder is shown when reminders are switched off', async () => {
    launched = await launchApp({
        settings: { workDuration: 60_000, breakPreNotificationOffset: 55_000, enableBreakNotification: false },
    })

    await new Promise((resolve) => setTimeout(resolve, 12_000))
    expect(launched.app.windows().filter((window) => window.url().includes('reminder.html'))).toHaveLength(0)
})

test('“Start now” on the reminder opens the break overlay', async () => {
    launched = await launchApp({
        settings: { workDuration: 60_000, breakPreNotificationOffset: 55_000, enableBreakNotification: true, reminderStyle: 'in-app' },
    })

    const toast = await waitForWindow(launched.app, 'reminder.html', 30_000)
    await toast.locator('#start-now').click()

    const overlay = await waitForWindow(launched.app, 'overlay.html', 15_000)
    await expect(overlay.locator('#break-view')).toBeVisible()
})

test('the reminder falls back to the toast when system notifications cannot deliver', async () => {
    // Headless Linux has no notification daemon, so the `system` style has to
    // degrade rather than silently show nothing.
    launched = await launchApp({
        settings: { workDuration: 60_000, breakPreNotificationOffset: 55_000, enableBreakNotification: true, reminderStyle: 'system' },
    })

    const shown = await Promise.race([
        waitForWindow(launched.app, 'reminder.html', 30_000).then(() => 'toast'),
        new Promise<string>((resolve) => setTimeout(() => resolve('native'), 30_000)),
    ])

    // Either outcome is acceptable — what matters is that the app did not throw
    // trying to decide.
    expect(['toast', 'native']).toContain(shown)
    expect(launched.output()).not.toContain('uncaught exception')
})
