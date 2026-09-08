import { describe, expect, it } from 'vitest'
import { reduceBreakOutcome } from '../src/core/stats'
import { DEFAULT_STATS, MINUTE } from '../src/core/settings'
import { Stats } from '../src/core/types'

const at = 1_700_000_000_000
const work = 20 * MINUTE

describe('reduceBreakOutcome', () => {
    it('counts a completed break and starts the streak clock', () => {
        const next = reduceBreakOutcome(DEFAULT_STATS, { outcome: 'completed', at, workDuration: work })
        expect(next.breakStreakCount).toBe(1)
        expect(next.breakStreakDuration).toBe(work)
        expect(next.streakStartTime).toBe(at)
    })

    it('keeps the original start time as the streak grows', () => {
        let stats: Stats = DEFAULT_STATS
        stats = reduceBreakOutcome(stats, { outcome: 'completed', at, workDuration: work })
        stats = reduceBreakOutcome(stats, { outcome: 'completed', at: at + work, workDuration: work })
        expect(stats.breakStreakCount).toBe(2)
        expect(stats.streakStartTime).toBe(at)
        expect(stats.breakStreakDuration).toBe(2 * work)
    })

    it('resets the running streak on a skip but preserves the best', () => {
        let stats: Stats = DEFAULT_STATS
        for (let i = 0; i < 3; i++) {
            stats = reduceBreakOutcome(stats, { outcome: 'completed', at: at + i * work, workDuration: work })
        }
        expect(stats.highestStreakCount).toBe(3)

        const skipped = reduceBreakOutcome(stats, { outcome: 'skipped', at: at + 10 * work, workDuration: work })
        expect(skipped.breakStreakCount).toBe(0)
        expect(skipped.breakStreakDuration).toBe(0)
        expect(skipped.highestStreakCount).toBe(3)
        expect(skipped.highestStreakDuration).toBe(3 * work)
    })

    it('only replaces the record when the streak actually beats it', () => {
        let stats: Stats = DEFAULT_STATS
        for (let i = 0; i < 5; i++) {
            stats = reduceBreakOutcome(stats, { outcome: 'completed', at: at + i * work, workDuration: work })
        }
        stats = reduceBreakOutcome(stats, { outcome: 'skipped', at: at + 6 * work, workDuration: work })
        stats = reduceBreakOutcome(stats, { outcome: 'completed', at: at + 7 * work, workDuration: work })

        expect(stats.breakStreakCount).toBe(1)
        expect(stats.highestStreakCount).toBe(5)
        expect(stats.highestStreakEndTime).toBe(at + 4 * work)
    })

    it('starts a fresh streak clock after a skip', () => {
        let stats = reduceBreakOutcome(DEFAULT_STATS, { outcome: 'completed', at, workDuration: work })
        stats = reduceBreakOutcome(stats, { outcome: 'skipped', at: at + work, workDuration: work })
        stats = reduceBreakOutcome(stats, { outcome: 'completed', at: at + 2 * work, workDuration: work })
        expect(stats.streakStartTime).toBe(at + 2 * work)
    })

    it('never accrues negative duration', () => {
        const next = reduceBreakOutcome(DEFAULT_STATS, { outcome: 'completed', at, workDuration: -1000 })
        expect(next.breakStreakDuration).toBe(0)
    })

    it('does not mutate its input', () => {
        const before = { ...DEFAULT_STATS }
        reduceBreakOutcome(before, { outcome: 'completed', at, workDuration: work })
        expect(before).toEqual(DEFAULT_STATS)
    })
})
