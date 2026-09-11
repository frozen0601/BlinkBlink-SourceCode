import { expect, test } from '@playwright/test'
import { launchApp, LaunchedApp, waitForWindow } from './helpers'
import { EMPTY_HISTORY, recordBreak } from '../../src/core/breakHistory'

/*
 * The statistics window reads a history it cannot invent, so these seed one.
 * A window that renders a chart from real rows is the part unit tests cannot
 * reach: every view here goes through the DOM, an SVG path and a percentage
 * width, and any of those can be right in the reducer and wrong on screen.
 */

/** Four weeks of a plausible working pattern, with a bad Wednesday afternoon. */
function seedHistory() {
    let history = EMPTY_HISTORY
    const now = new Date()

    for (let back = 27; back >= 0; back--) {
        const day = new Date(now)
        day.setDate(day.getDate() - back)
        if (day.getDay() === 0 || day.getDay() === 6) continue

        for (const hour of [9, 10, 11, 13, 14, 15, 16]) {
            const at = new Date(day)
            at.setHours(hour, 0, 0, 0)
            if (at > now) continue
            const skip = hour === 15 && day.getDay() === 3
            history = recordBreak(history, skip ? 'skipped' : 'completed', at)
        }
    }

    return history
}

let launched: LaunchedApp

test.afterEach(async () => {
    await launched?.close()
})

test('the statistics window renders a real history', async () => {
    launched = await launchApp({
        args: ['--stats'],
        store: {
            history: seedHistory(),
            stats: {
                breakStreakCount: 12,
                breakStreakDuration: 12 * 20 * 60_000,
                streakStartTime: Date.now() - 3 * 86_400_000,
                highestStreakCount: 21,
                highestStreakDuration: 21 * 20 * 60_000,
                highestStreakStartTime: Date.now() - 30 * 86_400_000,
                highestStreakEndTime: Date.now() - 20 * 86_400_000,
            },
        },
    })

    const stats = await waitForWindow(launched.app, 'stats.html')

    // The headline is the week's count, and it has to add up.
    const taken = Number(await stats.locator('#taken').innerText())
    const offered = Number(await stats.locator('#offered').innerText())
    expect(offered).toBeGreaterThan(0)
    expect(taken).toBeLessThanOrEqual(offered)

    await expect(stats.locator('#summary')).not.toBeEmpty()

    // Only hours that saw a break appear, and one row per hour.
    const hours = await stats.locator('.hour').count()
    expect(hours).toBeGreaterThan(0)
    expect(hours).toBeLessThanOrEqual(24)

    // The trend is drawn, not just declared.
    await expect(stats.locator('.trend .line')).toHaveCount(1)
    await expect(stats.locator('#since')).toContainText('breaks taken since')
})

test('an install with no history is invited to start rather than shown zeroes', async () => {
    launched = await launchApp({ args: ['--stats'] })
    const stats = await waitForWindow(launched.app, 'stats.html')

    await expect(stats.locator('#taken')).toHaveText('0')
    await expect(stats.locator('#summary')).toContainText('No breaks yet')
    // An empty chart with an axis under it reads as broken, so it is not drawn.
    await expect(stats.locator('.trend .line')).toHaveCount(0)
    expect(await stats.locator('body.empty').count()).toBe(1)
})
