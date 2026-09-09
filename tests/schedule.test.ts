import { describe, expect, it } from 'vitest'
import {
    expandIntervals,
    formatTimeOfDay,
    getActiveInterval,
    getCurrentRangeEnd,
    getNextActiveTime,
    isWithinActiveHours,
    parseTimeOfDay,
    totalScheduledMinutes,
} from '../src/core/schedule'
import { DEFAULT_SCHEDULE, normalizeSchedule } from '../src/core/settings'
import { WeeklySchedule } from '../src/core/types'

/** Dates are built with the local-time constructor so the suite is timezone agnostic. */
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0)

const emptyWeek = (): WeeklySchedule =>
    normalizeSchedule({
        monday: { enabled: false, timeRanges: [] },
        tuesday: { enabled: false, timeRanges: [] },
        wednesday: { enabled: false, timeRanges: [] },
        thursday: { enabled: false, timeRanges: [] },
        friday: { enabled: false, timeRanges: [] },
        saturday: { enabled: false, timeRanges: [] },
        sunday: { enabled: false, timeRanges: [] },
    })

const weekWith = (day: keyof WeeklySchedule, ranges: { start: string; end: string }[]): WeeklySchedule => {
    const week = emptyWeek()
    week[day] = { enabled: true, timeRanges: ranges }
    return week
}

describe('parseTimeOfDay', () => {
    it('parses valid 24-hour times', () => {
        expect(parseTimeOfDay('00:00')).toBe(0)
        expect(parseTimeOfDay('09:30')).toBe(570)
        expect(parseTimeOfDay('23:59')).toBe(1439)
        expect(parseTimeOfDay('9:05')).toBe(545)
    })

    it('rejects malformed and out-of-range values', () => {
        expect(parseTimeOfDay('24:00')).toBeNull()
        expect(parseTimeOfDay('12:60')).toBeNull()
        expect(parseTimeOfDay('12')).toBeNull()
        expect(parseTimeOfDay('')).toBeNull()
        expect(parseTimeOfDay('noon')).toBeNull()
        expect(parseTimeOfDay('1:2')).toBeNull()
    })
})

describe('formatTimeOfDay', () => {
    it('round-trips through parseTimeOfDay', () => {
        for (const value of ['00:00', '07:05', '13:45', '23:59']) {
            expect(formatTimeOfDay(parseTimeOfDay(value)!)).toBe(value)
        }
    })
})

describe('isWithinActiveHours', () => {
    // 2024-01-15 is a Monday.
    const week = weekWith('monday', [{ start: '09:00', end: '18:00' }])

    it('is true inside the range and false outside it', () => {
        expect(isWithinActiveHours(week, local(2024, 1, 15, 9, 0))).toBe(true)
        expect(isWithinActiveHours(week, local(2024, 1, 15, 13, 30))).toBe(true)
        expect(isWithinActiveHours(week, local(2024, 1, 15, 8, 59))).toBe(false)
    })

    it('treats the end of the range as exclusive', () => {
        expect(isWithinActiveHours(week, local(2024, 1, 15, 17, 59))).toBe(true)
        expect(isWithinActiveHours(week, local(2024, 1, 15, 18, 0))).toBe(false)
    })

    it('is false on a day that is not enabled', () => {
        expect(isWithinActiveHours(week, local(2024, 1, 16, 13, 0))).toBe(false)
    })

    it('handles multiple ranges in one day', () => {
        const split = weekWith('monday', [
            { start: '09:00', end: '12:00' },
            { start: '13:00', end: '18:00' },
        ])
        expect(isWithinActiveHours(split, local(2024, 1, 15, 11, 0))).toBe(true)
        expect(isWithinActiveHours(split, local(2024, 1, 15, 12, 30))).toBe(false)
        expect(isWithinActiveHours(split, local(2024, 1, 15, 14, 0))).toBe(true)
    })

    it('does not depend on the order ranges are stored in', () => {
        const unsorted = weekWith('monday', [
            { start: '13:00', end: '18:00' },
            { start: '09:00', end: '12:00' },
        ])
        expect(isWithinActiveHours(unsorted, local(2024, 1, 15, 10, 0))).toBe(true)
        expect(isWithinActiveHours(unsorted, local(2024, 1, 15, 15, 0))).toBe(true)
    })
})

describe('overnight ranges', () => {
    // A night shift starting Monday 22:00 and ending Tuesday 02:00.
    const week = weekWith('monday', [{ start: '22:00', end: '02:00' }])

    it('stays active past midnight', () => {
        expect(isWithinActiveHours(week, local(2024, 1, 15, 23, 30))).toBe(true)
        expect(isWithinActiveHours(week, local(2024, 1, 16, 1, 30))).toBe(true)
        expect(isWithinActiveHours(week, local(2024, 1, 16, 2, 30))).toBe(false)
    })

    it('reports the range end on the following day', () => {
        const end = getCurrentRangeEnd(week, local(2024, 1, 16, 0, 30))
        expect(end).toEqual(local(2024, 1, 16, 2, 0))
    })

    it('counts wrapped minutes correctly', () => {
        expect(totalScheduledMinutes(week)).toBe(4 * 60)
    })
})

describe('getCurrentRangeEnd', () => {
    const week = weekWith('monday', [{ start: '09:00', end: '18:00' }])

    it('returns the end of the containing range', () => {
        expect(getCurrentRangeEnd(week, local(2024, 1, 15, 10, 0))).toEqual(local(2024, 1, 15, 18, 0))
    })

    it('returns null outside any range', () => {
        expect(getCurrentRangeEnd(week, local(2024, 1, 15, 20, 0))).toBeNull()
    })

    it('prefers the furthest-reaching range when ranges overlap', () => {
        const overlapping = weekWith('monday', [
            { start: '09:00', end: '12:00' },
            { start: '10:00', end: '18:00' },
        ])
        expect(getCurrentRangeEnd(overlapping, local(2024, 1, 15, 11, 0))).toEqual(local(2024, 1, 15, 18, 0))
    })
})

describe('getNextActiveTime', () => {
    it('returns the reference instant when already active', () => {
        const week = weekWith('monday', [{ start: '09:00', end: '18:00' }])
        const now = local(2024, 1, 15, 10, 0)
        expect(getNextActiveTime(week, now)).toEqual(now)
    })

    it('returns today’s start when the day has not begun', () => {
        const week = weekWith('monday', [{ start: '09:00', end: '18:00' }])
        expect(getNextActiveTime(week, local(2024, 1, 15, 7, 0))).toEqual(local(2024, 1, 15, 9, 0))
    })

    it('rolls forward to the next enabled day', () => {
        const week = weekWith('wednesday', [{ start: '09:00', end: '18:00' }])
        expect(getNextActiveTime(week, local(2024, 1, 15, 19, 0))).toEqual(local(2024, 1, 17, 9, 0))
    })

    it('wraps across the end of the week', () => {
        const week = weekWith('monday', [{ start: '09:00', end: '18:00' }])
        // Friday evening -> next Monday morning.
        expect(getNextActiveTime(week, local(2024, 1, 19, 20, 0))).toEqual(local(2024, 1, 22, 9, 0))
    })

    it('returns null when nothing is ever scheduled', () => {
        expect(getNextActiveTime(emptyWeek(), local(2024, 1, 15, 10, 0))).toBeNull()
    })

    it('picks the earliest of several ranges later the same day', () => {
        const week = weekWith('monday', [
            { start: '16:00', end: '18:00' },
            { start: '09:00', end: '12:00' },
        ])
        expect(getNextActiveTime(week, local(2024, 1, 15, 7, 0))).toEqual(local(2024, 1, 15, 9, 0))
        expect(getNextActiveTime(week, local(2024, 1, 15, 13, 0))).toEqual(local(2024, 1, 15, 16, 0))
    })
})

describe('expandIntervals', () => {
    it('includes an overnight range that started the day before the reference', () => {
        const week = weekWith('sunday', [{ start: '23:00', end: '03:00' }])
        // Monday 01:00 — the containing interval began on Sunday.
        const intervals = expandIntervals(week, local(2024, 1, 15, 1, 0), 1)
        expect(intervals).toHaveLength(1)
        expect(intervals[0].start).toEqual(local(2024, 1, 14, 23, 0))
        expect(intervals[0].end).toEqual(local(2024, 1, 15, 3, 0))
    })

    it('skips malformed ranges rather than throwing', () => {
        const week = emptyWeek()
        week.monday = { enabled: true, timeRanges: [{ start: 'bogus', end: '18:00' }] }
        expect(expandIntervals(week, local(2024, 1, 15, 10, 0), 1)).toHaveLength(0)
    })

    it('returns intervals sorted by start time', () => {
        const week = weekWith('monday', [
            { start: '16:00', end: '18:00' },
            { start: '09:00', end: '12:00' },
        ])
        const intervals = expandIntervals(week, local(2024, 1, 15, 10, 0), 1)
        const starts = intervals.map((i) => i.start.getTime())
        expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    })
})

describe('getActiveInterval with the shipped defaults', () => {
    it('is active on a Wednesday afternoon and idle at the weekend', () => {
        expect(getActiveInterval(DEFAULT_SCHEDULE, local(2024, 1, 17, 14, 0))).not.toBeNull()
        expect(getActiveInterval(DEFAULT_SCHEDULE, local(2024, 1, 20, 14, 0))).toBeNull()
    })
})
