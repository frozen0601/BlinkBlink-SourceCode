import { describe, expect, it } from 'vitest'
import {
    BreakHistory,
    EMPTY_HISTORY,
    RETAIN_DAYS,
    dayKey,
    fold,
    formatHour,
    hourBreakdown,
    normalizeHistory,
    recordBreak,
    startOfWeek,
    summarySentence,
    totalBreaks,
    weekSummary,
    weeklyTrend,
    worstHour,
} from '../src/core/breakHistory'

/** A Wednesday, mid-afternoon. */
const WEDNESDAY = new Date(2026, 8, 9, 15, 30)

const at = (day: number, hour: number) => new Date(2026, 8, day, hour, 0)

function build(entries: [day: number, hour: number, outcome: 'completed' | 'skipped'][]): BreakHistory {
    return entries.reduce((history, [day, hour, outcome]) => recordBreak(history, outcome, at(day, hour)), EMPTY_HISTORY)
}

describe('dayKey', () => {
    it('uses the local day, not UTC', () => {
        // A break at half past eleven at night belongs to the day just worked
        // through. In any timezone east of Greenwich, UTC would file it under
        // tomorrow.
        expect(dayKey(new Date(2026, 8, 9, 23, 30))).toBe('2026-09-09')
        expect(dayKey(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01')
    })
})

describe('recordBreak', () => {
    it('counts a break against its day and its hour', () => {
        const history = build([[9, 14, 'completed']])
        expect(history.daily['2026-09-09']).toEqual({ t: 1, s: 0, h: { 14: [1, 0] } })
    })

    it('keeps taken and skipped apart within the same hour', () => {
        const history = build([
            [9, 14, 'completed'],
            [9, 14, 'skipped'],
            [9, 14, 'completed'],
        ])
        expect(history.daily['2026-09-09']).toEqual({ t: 2, s: 1, h: { 14: [2, 1] } })
    })

    it('never mutates the history it was given', () => {
        const before = build([[9, 14, 'completed']])
        const snapshot = JSON.parse(JSON.stringify(before))
        recordBreak(before, 'skipped', at(9, 15))
        expect(before).toEqual(snapshot)
    })
})

describe('fold', () => {
    it('rolls days past the retention window into monthly totals', () => {
        const old = new Date(WEDNESDAY)
        old.setDate(old.getDate() - RETAIN_DAYS - 5)
        const history = recordBreak(EMPTY_HISTORY, 'completed', old)

        const folded = fold(history, WEDNESDAY)
        expect(Object.keys(folded.daily)).toHaveLength(0)
        expect(folded.monthly[dayKey(old).slice(0, 7)]).toEqual({ t: 1, s: 0 })
    })

    it('leaves recent days alone', () => {
        const history = build([[9, 14, 'completed']])
        expect(fold(history, WEDNESDAY)).toBe(history)
    })

    it('keeps the all-time count across the fold', () => {
        const old = new Date(WEDNESDAY)
        old.setDate(old.getDate() - RETAIN_DAYS - 5)
        const history = recordBreak(build([[9, 14, 'completed']]), 'completed', old)
        expect(totalBreaks(fold(history, WEDNESDAY))).toBe(2)
    })
})

describe('startOfWeek', () => {
    it('starts on Monday, including when today is Sunday', () => {
        expect(dayKey(startOfWeek(new Date(2026, 8, 9)))).toBe('2026-09-07')
        expect(dayKey(startOfWeek(new Date(2026, 8, 13)))).toBe('2026-09-07')
        expect(dayKey(startOfWeek(new Date(2026, 8, 7)))).toBe('2026-09-07')
    })
})

describe('weekSummary', () => {
    it('counts every break the app offered, taken or not', () => {
        const history = build([
            [7, 9, 'completed'],
            [8, 10, 'completed'],
            [9, 15, 'skipped'],
        ])
        expect(weekSummary(history, WEDNESDAY)).toMatchObject({ taken: 2, offered: 3 })
    })

    it('ignores last week', () => {
        const history = build([
            [2, 9, 'completed'],
            [9, 9, 'completed'],
        ])
        expect(weekSummary(history, WEDNESDAY).offered).toBe(1)
    })

    it('notices when the skips are after lunch', () => {
        const history = build([
            [9, 9, 'skipped'],
            [9, 14, 'skipped'],
            [9, 15, 'skipped'],
        ])
        expect(weekSummary(history, WEDNESDAY).skippedAfternoon).toBe(2)
    })
})

describe('weeklyTrend', () => {
    it('returns one rate per week, oldest first, with this week last', () => {
        const history = build([
            [9, 9, 'completed'],
            [9, 10, 'skipped'],
        ])
        const trend = weeklyTrend(history, WEDNESDAY)
        expect(trend).toHaveLength(8)
        expect(trend[7]).toBeCloseTo(0.5)
    })

    it('reports a week with no breaks as null rather than zero', () => {
        // A week on holiday is not a week of skipping, and a line that drops to
        // the floor for it would be saying something untrue.
        expect(weeklyTrend(EMPTY_HISTORY, WEDNESDAY).every((rate) => rate === null)).toBe(true)
    })
})

describe('hourBreakdown', () => {
    it('reports only the hours that saw a break', () => {
        const history = build([
            [9, 9, 'completed'],
            [9, 15, 'skipped'],
        ])
        expect(hourBreakdown(history, WEDNESDAY).map((row) => row.hour)).toEqual([9, 15])
    })

    it('is what keeps a schedule honest: an hour never worked is never shown', () => {
        const history = build([[9, 9, 'completed']])
        expect(hourBreakdown(history, WEDNESDAY).some((row) => row.hour === 3)).toBe(false)
    })
})

describe('worstHour', () => {
    it('names the hour that stands out', () => {
        expect(
            worstHour([
                { hour: 15, taken: 1, skipped: 5 },
                { hour: 9, taken: 9, skipped: 1 },
            ])
        ).toBe(15)
    })

    it('says nothing when there is no pattern, only a bad afternoon', () => {
        expect(worstHour([{ hour: 15, taken: 1, skipped: 2 }])).toBeNull()
        expect(worstHour([])).toBeNull()
    })

    it('says nothing when two hours tie', () => {
        expect(
            worstHour([
                { hour: 15, taken: 1, skipped: 4 },
                { hour: 11, taken: 1, skipped: 4 },
            ])
        ).toBeNull()
    })
})

describe('summarySentence', () => {
    it('invites a first break rather than reporting a zero', () => {
        expect(summarySentence({ taken: 0, offered: 0, skippedAfternoon: 0 }, [])).toContain('No breaks yet')
    })

    it('says so plainly when nothing was missed', () => {
        expect(summarySentence({ taken: 12, offered: 12, skippedAfternoon: 0 }, [])).toContain('every one')
    })

    it('counts what went by', () => {
        expect(summarySentence({ taken: 10, offered: 13, skippedAfternoon: 0 }, [])).toContain('3 went by')
    })

    it('only blames the afternoon when the afternoon is to blame', () => {
        const hours: never[] = []
        expect(summarySentence({ taken: 10, offered: 14, skippedAfternoon: 4 }, hours)).toContain('after lunch')
        expect(summarySentence({ taken: 10, offered: 14, skippedAfternoon: 1 }, hours)).not.toContain('after lunch')
        // Two skips is not a pattern, however they fall.
        expect(summarySentence({ taken: 10, offered: 12, skippedAfternoon: 2 }, hours)).not.toContain('after lunch')
    })

    it('names an hour only when one stands out', () => {
        const standout = [{ hour: 15, taken: 2, skipped: 6 }]
        expect(summarySentence({ taken: 10, offered: 16, skippedAfternoon: 6 }, standout)).toContain('3pm')
        expect(summarySentence({ taken: 10, offered: 16, skippedAfternoon: 6 }, [])).not.toContain('around')
    })
})

describe('formatHour', () => {
    it('reads like a clock, not a database', () => {
        expect(formatHour(0)).toBe('12am')
        expect(formatHour(9)).toBe('9am')
        expect(formatHour(12)).toBe('12pm')
        expect(formatHour(15)).toBe('3pm')
    })
})

describe('normalizeHistory', () => {
    it('survives anything that is not a history at all', () => {
        expect(normalizeHistory(null)).toEqual(EMPTY_HISTORY)
        expect(normalizeHistory('nonsense')).toEqual(EMPTY_HISTORY)
        expect(normalizeHistory({ daily: 42 })).toEqual(EMPTY_HISTORY)
    })

    it('drops rows a crash or an editor left malformed', () => {
        const input = {
            daily: {
                '2026-09-09': { t: 2, s: 1, h: { 14: [2, 1] } },
                'not-a-date': { t: 9, s: 9, h: {} },
                '2026-09-10': { t: 'many', s: 0, h: {} },
            },
            monthly: { '2026-08': { t: 30, s: 4 }, bad: { t: 1, s: 1 } },
        }
        const result = normalizeHistory(input)
        expect(Object.keys(result.daily)).toEqual(['2026-09-09'])
        expect(Object.keys(result.monthly)).toEqual(['2026-08'])
    })

    it('drops hours outside a day', () => {
        const result = normalizeHistory({ daily: { '2026-09-09': { t: 1, s: 0, h: { 14: [1, 0], 99: [5, 5] } } } })
        expect(Object.keys(result.daily['2026-09-09'].h)).toEqual(['14'])
    })

    it('refuses a negative count rather than summing it', () => {
        expect(normalizeHistory({ daily: { '2026-09-09': { t: -3, s: 0, h: {} } } }).daily).toEqual({})
    })
})
