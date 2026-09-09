import { describe, expect, it } from 'vitest'
import { calculateMilestones, formatDuration, formatRemainingTime, milestoneProgress } from '../src/core/format'

describe('formatRemainingTime', () => {
    it('formats minutes below an hour', () => {
        expect(formatRemainingTime(0)).toBe('0m')
        expect(formatRemainingTime(1)).toBe('1m')
        expect(formatRemainingTime(59)).toBe('59m')
    })

    it('formats whole and partial hours', () => {
        expect(formatRemainingTime(60)).toBe('1h')
        expect(formatRemainingTime(75)).toBe('1h 15m')
        expect(formatRemainingTime(120)).toBe('2h')
    })

    it('clamps negatives rather than showing "-3m"', () => {
        expect(formatRemainingTime(-3)).toBe('0m')
    })
})

describe('formatDuration', () => {
    it('describes zero and sub-minute durations in seconds', () => {
        expect(formatDuration(0)).toBe('0 seconds')
        expect(formatDuration(1000)).toBe('1 second')
        expect(formatDuration(45_000)).toBe('45 seconds')
    })

    it('drops seconds once there is a larger unit', () => {
        expect(formatDuration(90_000)).toBe('1 minute')
    })

    it('combines days, hours and minutes', () => {
        const ms = 2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000
        expect(formatDuration(ms)).toBe('2 days 3 hours 4 minutes')
    })

    it('handles junk input', () => {
        expect(formatDuration(Number.NaN)).toBe('0 seconds')
        expect(formatDuration(-1)).toBe('0 seconds')
    })
})

describe('calculateMilestones', () => {
    it('uses the hand-picked early ladder up to 50', () => {
        expect(calculateMilestones(0)).toEqual([0, 3, 10, 20, 50])
        expect(calculateMilestones(50)).toEqual([0, 3, 10, 20, 50])
    })

    it('steps in hundreds past 50', () => {
        expect(calculateMilestones(51)).toEqual([50, 75, 100, 125, 150])
        expect(calculateMilestones(151)).toEqual([150, 175, 200, 225, 250])
    })

    it('always returns five ascending markers', () => {
        for (const streak of [0, 7, 50, 51, 99, 300, 1234]) {
            const milestones = calculateMilestones(streak)
            expect(milestones).toHaveLength(5)
            expect([...milestones].sort((a, b) => a - b)).toEqual(milestones)
        }
    })
})

describe('milestoneProgress', () => {
    it('is 0 at the start of the ladder and 1 at the end', () => {
        const milestones = calculateMilestones(0)
        expect(milestoneProgress(0, milestones)).toBe(0)
        expect(milestoneProgress(50, milestones)).toBe(1)
    })

    it('advances monotonically', () => {
        const milestones = calculateMilestones(0)
        let previous = -1
        for (let streak = 0; streak <= 50; streak++) {
            const value = milestoneProgress(streak, milestones)
            expect(value).toBeGreaterThanOrEqual(previous)
            previous = value
        }
    })

    it('stays within 0..1 beyond the last milestone', () => {
        const milestones = calculateMilestones(0)
        expect(milestoneProgress(999, milestones)).toBe(1)
    })
})
