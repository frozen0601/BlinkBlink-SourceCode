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

test('the break screen shows nothing that counts down', async () => {
    // The screen exists to send someone's eyes twenty feet away. It carried a
    // countdown number once and a progress bar after that, and both gave people
    // a reason to keep watching the screen instead. Nothing on it may tick.
    launched = await launchApp({ args: ['--take-break'], settings: { breakDuration: 30_000 } })
    const overlay = await waitForWindow(launched.app, 'overlay.html')

    await expect.poll(() => overlay.evaluate(() => document.body.classList.contains('show-break')), { timeout: 10_000 }).toBe(true)
    await expect(overlay.locator('#progress-bar')).toHaveCount(0)

    // Nothing on the screen may be tied to how long is left. A countdown shows
    // up as an animation or transition running for something like the break's
    // own duration; the entrance fades are a fraction of a second, so the
    // length is what separates them. (Counting running animations instead was
    // flaky: an entrance fade finishes between two samples.)
    const timedToTheBreak = await overlay.evaluate(() =>
        document
            .getAnimations()
            .map((animation) => Number(animation.effect?.getTiming().duration) || 0)
            .filter((duration) => duration >= 5000)
    )
    expect(timedToTheBreak).toEqual([])

    // And the text has to say the same thing two seconds later.
    const readBreakText = () => overlay.evaluate(() => document.getElementById('break-view')?.innerText ?? '')
    const before = await readBreakText()
    await overlay.waitForTimeout(2000)
    expect(await readBreakText()).toBe(before)
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
