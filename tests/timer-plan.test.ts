import { describe, expect, it } from 'vitest'
import { clampDelay, clockJumped, MAX_TIMEOUT_MS, planNextBreak, planReminder } from '../src/core/timer-plan'
import { MINUTE, normalizeSchedule } from '../src/core/settings'
import { WeeklySchedule } from '../src/core/types'

const local = (y: number, m: number, d: number, h = 0, min = 0, sec = 0) => new Date(y, m - 1, d, h, min, sec, 0)

const week = (day: keyof WeeklySchedule, ranges: { start: string; end: string }[]): WeeklySchedule => {
    const base = normalizeSchedule({}) as WeeklySchedule
    for (const key of Object.keys(base) as (keyof WeeklySchedule)[]) {
        base[key] = { enabled: false, timeRanges: [] }
    }
    base[day] = { enabled: true, timeRanges: ranges }
    return base
}

const workdays = week('monday', [{ start: '09:00', end: '18:00' }])

describe('planNextBreak without a schedule', () => {
    it('arms a break one work interval away', () => {
        const now = local(2024, 1, 15, 10, 0)
        const plan = planNextBreak({ now, workDuration: 20 * MINUTE, scheduleEnabled: false, schedule: workdays })
        expect(plan).toEqual({ kind: 'break', at: local(2024, 1, 15, 10, 20) })
    })

    it('honours an active skip instead of the work interval', () => {
        const now = local(2024, 1, 15, 10, 0)
        const plan = planNextBreak({
            now,
            workDuration: 20 * MINUTE,
            scheduleEnabled: false,
            schedule: workdays,
            skipUntil: local(2024, 1, 15, 11, 30),
        })
        expect(plan).toEqual({ kind: 'break', at: local(2024, 1, 15, 11, 30) })
    })

    it('ignores a skip that has already elapsed', () => {
        const now = local(2024, 1, 15, 10, 0)
        const plan = planNextBreak({
            now,
            workDuration: 20 * MINUTE,
            scheduleEnabled: false,
            schedule: workdays,
            skipUntil: local(2024, 1, 15, 9, 0),
        })
        expect(plan).toEqual({ kind: 'break', at: local(2024, 1, 15, 10, 20) })
    })
})

describe('planNextBreak with a schedule', () => {
    it('arms a break normally inside working hours', () => {
        const plan = planNextBreak({
            now: local(2024, 1, 15, 10, 0),
            workDuration: 20 * MINUTE,
            scheduleEnabled: true,
            schedule: workdays,
        })
        expect(plan).toEqual({ kind: 'break', at: local(2024, 1, 15, 10, 20) })
    })

    it('waits for the start of the working day rather than breaking immediately', () => {
        const plan = planNextBreak({
            now: local(2024, 1, 15, 7, 0),
            workDuration: 20 * MINUTE,
            scheduleEnabled: true,
            schedule: workdays,
        })
        // Regression guard: the previous implementation armed the *break* at
        // 09:00, so users were interrupted the moment their day started.
        expect(plan).toEqual({ kind: 'wait', until: local(2024, 1, 15, 9, 0), reason: 'outside-schedule' })
    })

    it('waits for the next working day instead of dying at the end of the current one', () => {
        // 17:50 with a 20 minute interval: the break would land at 18:10, past
        // the end of the working day. The old code cleared the timer and never
        // re-armed it, so the app went silent until it was restarted.
        const plan = planNextBreak({
            now: local(2024, 1, 15, 17, 50),
            workDuration: 20 * MINUTE,
            scheduleEnabled: true,
            schedule: workdays,
        })
        expect(plan).toEqual({ kind: 'wait', until: local(2024, 1, 22, 9, 0), reason: 'outside-schedule' })
    })

    it('is idle when no day is enabled at all', () => {
        const nothing = normalizeSchedule({
            monday: { enabled: false, timeRanges: [] },
            tuesday: { enabled: false, timeRanges: [] },
            wednesday: { enabled: false, timeRanges: [] },
            thursday: { enabled: false, timeRanges: [] },
            friday: { enabled: false, timeRanges: [] },
            saturday: { enabled: false, timeRanges: [] },
            sunday: { enabled: false, timeRanges: [] },
        })
        const plan = planNextBreak({
            now: local(2024, 1, 15, 10, 0),
            workDuration: 20 * MINUTE,
            scheduleEnabled: true,
            schedule: nothing,
        })
        expect(plan).toEqual({ kind: 'idle' })
    })

    it('recovers after skip-until-end-of-day instead of stopping forever', () => {
        // The old skipBreaksUntilEndOfDay() cleared the timer outright.
        const endOfDay = local(2024, 1, 15, 23, 59)
        const plan = planNextBreak({
            now: local(2024, 1, 15, 11, 0),
            workDuration: 20 * MINUTE,
            scheduleEnabled: true,
            schedule: workdays,
            skipUntil: endOfDay,
        })
        expect(plan).toEqual({ kind: 'wait', until: local(2024, 1, 22, 9, 0), reason: 'skipped' })
    })

    it('keeps working through midnight on an overnight schedule', () => {
        const nights = week('monday', [{ start: '22:00', end: '02:00' }])
        const plan = planNextBreak({
            now: local(2024, 1, 16, 0, 30),
            workDuration: 20 * MINUTE,
            scheduleEnabled: true,
            schedule: nights,
        })
        expect(plan).toEqual({ kind: 'break', at: local(2024, 1, 16, 0, 50) })
    })
})

describe('planReminder', () => {
    it('returns the offset instant before the break', () => {
        const now = local(2024, 1, 15, 10, 0)
        const breakAt = local(2024, 1, 15, 10, 20)
        expect(planReminder(breakAt, 30_000, now)).toEqual(new Date(breakAt.getTime() - 30_000))
    })

    it('returns null when the reminder would already be due', () => {
        const now = local(2024, 1, 15, 10, 19, 50)
        expect(planReminder(local(2024, 1, 15, 10, 20), 30_000, now)).toBeNull()
    })

    it('returns null for a non-positive offset', () => {
        expect(planReminder(local(2024, 1, 15, 10, 20), 0, local(2024, 1, 15, 10, 0))).toBeNull()
    })
})

describe('clampDelay', () => {
    it('never exceeds what setTimeout can represent', () => {
        expect(clampDelay(30 * 24 * 60 * 60 * 1000)).toBe(MAX_TIMEOUT_MS)
    })

    it('floors negative and non-finite delays at zero', () => {
        expect(clampDelay(-5)).toBe(0)
        expect(clampDelay(Number.NaN)).toBe(0)
    })
})

describe('clockJumped', () => {
    it('ignores ordinary scheduling jitter', () => {
        expect(clockJumped(30_000, 30_400)).toBe(false)
    })

    it('detects a suspend or a manual clock change', () => {
        expect(clockJumped(30_000, 3_600_000)).toBe(true)
        expect(clockJumped(30_000, 100)).toBe(true)
    })
})
