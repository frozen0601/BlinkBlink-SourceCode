import { expect, test } from '@playwright/test'
import { launchApp, LaunchedApp, parseColor, waitForWindow } from './helpers'

let launched: LaunchedApp

test.afterEach(async () => {
    await launched?.close()
})

test('starts up without crashing and opens no window of its own', async () => {
    launched = await launchApp()

    // Give startup a moment to do anything it is going to do wrong.
    await new Promise((resolve) => setTimeout(resolve, 3000))

    expect(launched.output()).not.toContain('uncaught exception')
    expect(launched.output()).not.toContain('failed to start')
    // BlinkBlink lives in the tray; a bare launch should not pop a window.
    expect(launched.app.windows().filter((window) => window.url().includes('.html'))).toHaveLength(0)
})

test('the break overlay renders content rather than an empty window', async () => {
    launched = await launchApp({ args: ['--take-break'] })
    const overlay = await waitForWindow(launched.app, 'overlay.html')

    await expect(overlay.locator('#break-view')).toBeVisible()
    await expect(overlay.locator('#skip-button')).toBeVisible()
    await expect(overlay.locator('#break-view h1')).toContainText('Take A Break')
})

test('the overlay backdrop is a legible scrim, not an opaque white panel', async () => {
    launched = await launchApp({ args: ['--take-break'] })
    const overlay = await waitForWindow(launched.app, 'overlay.html')

    const backdrop = await overlay.evaluate(() => document.documentElement.dataset.backdrop)
    // Linux and pre-22H2 Windows both land on the scrim; macOS uses vibrancy.
    expect(['vibrancy', 'acrylic', 'translucent', 'solid']).toContain(backdrop)
    if (process.platform === 'linux') expect(backdrop).toBe('translucent')

    const { background, color } = await overlay.evaluate(() => {
        const style = getComputedStyle(document.body)
        return { background: style.backgroundColor, color: style.color }
    })

    const bg = parseColor(background)
    const fg = parseColor(color)

    // The Windows regression this guards against: `backgroundMaterial` with the
    // default opaque #FFF window background painted a blank white rectangle.
    const isOpaqueWhite = bg.a >= 0.99 && bg.r > 240 && bg.g > 240 && bg.b > 240
    expect(isOpaqueWhite, `overlay background was ${background}`).toBe(false)

    // Whatever the theme, the text has to contrast with the scrim behind it.
    const luminance = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
    expect(Math.abs(luminance(bg) - luminance(fg))).toBeGreaterThan(80)
})

test('the overlay is interactive: skip asks for confirmation, then closes', async () => {
    launched = await launchApp({ args: ['--take-break'] })
    const overlay = await waitForWindow(launched.app, 'overlay.html')

    const skip = overlay.locator('#skip-button')
    await skip.click()

    // First click arms the confirmation rather than skipping outright.
    await expect(overlay.locator('#warning-text')).toBeVisible()
    await expect(skip).toHaveText('Confirm skip')

    await skip.click()

    // A window that cannot be clicked — the Linux `type: 'notification'` bug —
    // would never get this far. Polling rather than awaiting the close event
    // avoids racing a window that has already gone.
    await expect.poll(() => overlay.isClosed(), { timeout: 15_000 }).toBe(true)
})

test('the countdown reaches a window that was still loading when it started', async () => {
    // The overlay window is created and its countdown started in the same tick,
    // so the first `webContents.send` lands before the renderer exists and is
    // dropped. Without catching the window up, the very first break of a
    // session showed a frozen progress bar and no seconds remaining.
    launched = await launchApp({ args: ['--take-break'], settings: { breakDuration: 30_000 } })
    const overlay = await waitForWindow(launched.app, 'overlay.html')

    await expect.poll(() => overlay.locator('#countdown-label').textContent(), { timeout: 10_000 }).toMatch(/^\d+$/)

    const progress = overlay.locator('#progress-bar')
    await expect.poll(() => progress.evaluate((el) => getComputedStyle(el).display), { timeout: 10_000 }).toBe('block')

    // A running CSS transition means the bar is animating rather than parked.
    const scaleAt = () => progress.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a)
    const first = await scaleAt()
    await overlay.waitForTimeout(1500)
    expect(await scaleAt()).toBeGreaterThan(first)
})

test('the content security policy does not block the overlay script', async () => {
    launched = await launchApp({ args: ['--take-break'] })
    const overlay = await waitForWindow(launched.app, 'overlay.html')

    const violations: string[] = []
    overlay.on('console', (message) => {
        if (message.text().includes('Content Security Policy')) violations.push(message.text())
    })

    // The backdrop attribute is only set by overlay.js, so its presence proves
    // the bundle loaded and ran under the page's CSP.
    await expect.poll(() => overlay.evaluate(() => document.documentElement.dataset.backdrop)).toBeTruthy()
    expect(violations).toEqual([])
})
