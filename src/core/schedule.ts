/**
 * Pure schedule maths.
 *
 * The weekly schedule is stored as wall-clock "HH:mm" strings per weekday. All
 * the questions the app actually asks ("am I working right now?", "when does
 * this stretch end?", "when do I start again?") are answered by expanding those
 * strings into concrete local `Date` intervals around a reference instant and
 * then doing plain comparisons.
 *
 * Expanding first is what makes overnight ranges (22:00 -> 02:00) work: a range
 * whose end is at or before its start simply ends on the following day.
 */

import { DAY_KEYS, DayKey, TimeRange, WeeklySchedule } from './types'

export interface Interval {
    start: Date
    end: Date
}

const MINUTES_PER_DAY = 24 * 60

/** Parses "HH:mm" into minutes past midnight, or `null` if malformed. */
export function parseTimeOfDay(value: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value)
    if (!match) return null
    const hours = Number(match[1])
    const minutes = Number(match[2])
    if (hours > 23 || minutes > 59) return null
    return hours * 60 + minutes
}

/** Formats minutes past midnight back into "HH:mm". */
export function formatTimeOfDay(minutes: number): string {
    const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
    const hours = Math.floor(wrapped / 60)
    return `${String(hours).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

export function isValidTimeRange(range: TimeRange): boolean {
    return parseTimeOfDay(range.start) !== null && parseTimeOfDay(range.end) !== null
}

function startOfDay(date: Date): Date {
    const copy = new Date(date)
    copy.setHours(0, 0, 0, 0)
    return copy
}

function addDays(date: Date, days: number): Date {
    const copy = new Date(date)
    copy.setDate(copy.getDate() + days)
    return copy
}

/**
 * Adds `minutes` to local midnight of `day`.
 *
 * `setHours` is used rather than millisecond arithmetic so that the result
 * lands on the intended wall-clock time even across a daylight-saving
 * transition — "09:00" should mean 09:00 on the clock, not "8h after midnight".
 */
function atMinuteOfDay(day: Date, minutes: number): Date {
    const result = startOfDay(day)
    result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
    return result
}

function dayKeyOf(date: Date): DayKey {
    return DAY_KEYS[date.getDay()]
}

/**
 * Expands the weekly schedule into concrete intervals covering
 * `[reference - 1 day, reference + daysAhead]`.
 *
 * The extra day of lookbehind matters: an overnight range that began yesterday
 * is still active at 01:00 today, and nothing in today's entry would say so.
 * Results are sorted by start time.
 */
export function expandIntervals(schedule: WeeklySchedule, reference: Date, daysAhead = 8): Interval[] {
    const intervals: Interval[] = []

    for (let offset = -1; offset <= daysAhead; offset++) {
        const day = addDays(reference, offset)
        const daySchedule = schedule[dayKeyOf(day)]
        if (!daySchedule?.enabled || !Array.isArray(daySchedule.timeRanges)) continue

        for (const range of daySchedule.timeRanges) {
            const startMinutes = parseTimeOfDay(range.start)
            const endMinutes = parseTimeOfDay(range.end)
            if (startMinutes === null || endMinutes === null) continue

            const start = atMinuteOfDay(day, startMinutes)
            // An end at or before the start means the stretch runs past midnight.
            const end = endMinutes > startMinutes ? atMinuteOfDay(day, endMinutes) : atMinuteOfDay(addDays(day, 1), endMinutes)

            if (end.getTime() > start.getTime()) intervals.push({ start, end })
        }
    }

    intervals.sort((a, b) => a.start.getTime() - b.start.getTime())
    return intervals
}

/**
 * Returns the active interval containing `date`, or `null`.
 *
 * When intervals overlap, the one reaching furthest into the future wins so
 * that a break is never cut short by an adjacent, shorter stretch.
 */
export function getActiveInterval(schedule: WeeklySchedule, date: Date): Interval | null {
    const time = date.getTime()
    let best: Interval | null = null

    for (const interval of expandIntervals(schedule, date, 1)) {
        if (interval.start.getTime() <= time && time < interval.end.getTime()) {
            if (!best || interval.end.getTime() > best.end.getTime()) best = interval
        }
    }

    return best
}

export function isWithinActiveHours(schedule: WeeklySchedule, date: Date): boolean {
    return getActiveInterval(schedule, date) !== null
}

/** The instant the currently active stretch ends, or `null` when not inside one. */
export function getCurrentRangeEnd(schedule: WeeklySchedule, date: Date): Date | null {
    return getActiveInterval(schedule, date)?.end ?? null
}

/**
 * The next instant at which work is scheduled.
 *
 * Returns `date` itself when it already falls inside an active stretch, and
 * `null` when the schedule has no enabled ranges at all within the lookahead
 * window (an entirely disabled schedule, for instance).
 */
export function getNextActiveTime(schedule: WeeklySchedule, date: Date, daysAhead = 8): Date | null {
    if (isWithinActiveHours(schedule, date)) return date

    const time = date.getTime()
    for (const interval of expandIntervals(schedule, date, daysAhead)) {
        if (interval.start.getTime() > time) return interval.start
    }

    return null
}

/** Total scheduled minutes in the week. Used to spot an all-empty schedule. */
export function totalScheduledMinutes(schedule: WeeklySchedule): number {
    let total = 0
    for (const key of DAY_KEYS) {
        const day = schedule[key]
        if (!day?.enabled || !Array.isArray(day.timeRanges)) continue
        for (const range of day.timeRanges) {
            const start = parseTimeOfDay(range.start)
            const end = parseTimeOfDay(range.end)
            if (start === null || end === null) continue
            total += end > start ? end - start : MINUTES_PER_DAY - start + end
        }
    }
    return total
}
