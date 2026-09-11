/**
 * The day-by-day record behind the statistics window.
 *
 * The app used to keep two streak counters, which answer "how long have I been
 * good" and nothing else. Everything worth showing — whether this week went
 * better than the last one, which hour of the day breaks get skipped — needs a
 * row per day, so that is what this keeps.
 *
 * Cost was the deciding constraint. One row is roughly 145 bytes of JSON for an
 * ordinary working day, or about 37 KB a year; `RETAIN_DAYS` of rows are kept
 * in full and anything older is folded into one row per month, so the file
 * stops growing at around 50 KB however long the app is installed.
 *
 * Nothing here is sent anywhere. This is local, and separate from the one
 * `app_started` event `core/analytics.ts` describes.
 */

/** Days of per-day detail kept before folding into monthly totals. */
export const RETAIN_DAYS = 400

/** A day's breaks. Short keys: this is written to disk on every break. */
export interface DayRow {
    /** Breaks taken in full. */
    t: number
    /** Breaks skipped or dismissed. */
    s: number
    /** `[taken, skipped]` by local hour, sparse — only hours that saw one. */
    h: Record<string, [number, number]>
}

/** A month's breaks, once the daily rows have been folded away. */
export interface MonthRow {
    t: number
    s: number
}

export interface BreakHistory {
    /** Keyed "YYYY-MM-DD" in local time. */
    daily: Record<string, DayRow>
    /** Keyed "YYYY-MM". */
    monthly: Record<string, MonthRow>
}

export type BreakOutcome = 'completed' | 'skipped'

export const EMPTY_HISTORY: BreakHistory = { daily: {}, monthly: {} }

/**
 * "YYYY-MM-DD" for the local day.
 *
 * Local rather than UTC deliberately: a break at 23:30 belongs to the day the
 * person just worked through, not to tomorrow in Greenwich.
 */
export function dayKey(at: Date): string {
    const month = String(at.getMonth() + 1).padStart(2, '0')
    const day = String(at.getDate()).padStart(2, '0')
    return `${at.getFullYear()}-${month}-${day}`
}

export function monthKey(at: Date): string {
    return dayKey(at).slice(0, 7)
}

const emptyDay = (): DayRow => ({ t: 0, s: 0, h: {} })

/** Records one break, and prunes anything past the retention window. */
export function recordBreak(history: BreakHistory, outcome: BreakOutcome, at: Date): BreakHistory {
    const key = dayKey(at)
    const hour = String(at.getHours())
    const previous = history.daily[key] ?? emptyDay()
    const [taken, skipped] = previous.h[hour] ?? [0, 0]

    const day: DayRow = {
        t: previous.t + (outcome === 'completed' ? 1 : 0),
        s: previous.s + (outcome === 'skipped' ? 1 : 0),
        h: { ...previous.h, [hour]: [taken + (outcome === 'completed' ? 1 : 0), skipped + (outcome === 'skipped' ? 1 : 0)] },
    }

    return fold({ daily: { ...history.daily, [key]: day }, monthly: history.monthly }, at)
}

/**
 * Folds days older than the retention window into monthly totals.
 *
 * The monthly rows keep the long view — "1,284 breaks since you installed it" —
 * without keeping 24 hourly buckets per day for ever.
 */
export function fold(history: BreakHistory, now: Date): BreakHistory {
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - RETAIN_DAYS)
    const cutoffKey = dayKey(cutoff)

    const daily: Record<string, DayRow> = {}
    const monthly: Record<string, MonthRow> = { ...history.monthly }
    let changed = false

    for (const [key, row] of Object.entries(history.daily)) {
        if (key >= cutoffKey) {
            daily[key] = row
            continue
        }
        const month = key.slice(0, 7)
        const existing = monthly[month] ?? { t: 0, s: 0 }
        monthly[month] = { t: existing.t + row.t, s: existing.s + row.s }
        changed = true
    }

    return changed ? { daily, monthly } : history
}

/**
 * Produces a usable history from whatever is on disk.
 *
 * Everything here is read back from a JSON file that a crash, a sync tool or a
 * text editor may have got to, and every view below sums over it, so a single
 * NaN would spread through the whole window. Malformed rows are dropped rather
 * than repaired: a day of counts is not worth guessing at.
 */
export function normalizeHistory(input: unknown): BreakHistory {
    const raw = (input && typeof input === 'object' ? input : {}) as Partial<BreakHistory>
    const count = (value: unknown): number | null => {
        const numeric = typeof value === 'number' ? value : Number(value)
        return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : null
    }

    const daily: Record<string, DayRow> = {}
    for (const [key, value] of Object.entries(raw.daily ?? {})) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== 'object') continue
        const row = value as Partial<DayRow>
        const taken = count(row.t)
        const skipped = count(row.s)
        if (taken === null || skipped === null) continue

        const hours: Record<string, [number, number]> = {}
        for (const [hour, pair] of Object.entries(row.h ?? {})) {
            const index = Number(hour)
            if (!Number.isInteger(index) || index < 0 || index > 23 || !Array.isArray(pair)) continue
            const hourTaken = count(pair[0])
            const hourSkipped = count(pair[1])
            if (hourTaken === null || hourSkipped === null) continue
            hours[String(index)] = [hourTaken, hourSkipped]
        }

        daily[key] = { t: taken, s: skipped, h: hours }
    }

    const monthly: Record<string, MonthRow> = {}
    for (const [key, value] of Object.entries(raw.monthly ?? {})) {
        if (!/^\d{4}-\d{2}$/.test(key) || !value || typeof value !== 'object') continue
        const row = value as Partial<MonthRow>
        const taken = count(row.t)
        const skipped = count(row.s)
        if (taken === null || skipped === null) continue
        monthly[key] = { t: taken, s: skipped }
    }

    return { daily, monthly }
}

// Views ------------------------------------------------------------------

export interface WeekSummary {
    /** Breaks taken in full. */
    taken: number
    /** Every break the app offered: taken plus skipped. */
    offered: number
    /** Of the skipped ones, how many were at midday or later. */
    skippedAfternoon: number
}

/** Monday, because a week that starts mid-weekend reads as two half weeks. */
export function startOfWeek(now: Date): Date {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    // getDay() is 0 for Sunday, which is six days into a Monday-first week.
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    return start
}

function sumRange(daily: Record<string, DayRow>, from: Date, to: Date): WeekSummary {
    const fromKey = dayKey(from)
    const toKey = dayKey(to)
    let taken = 0
    let offered = 0
    let skippedAfternoon = 0

    for (const [key, row] of Object.entries(daily)) {
        if (key < fromKey || key > toKey) continue
        taken += row.t
        offered += row.t + row.s
        for (const [hour, [, skipped]] of Object.entries(row.h)) {
            if (Number(hour) >= 12) skippedAfternoon += skipped
        }
    }

    return { taken, offered, skippedAfternoon }
}

export function weekSummary(history: BreakHistory, now: Date): WeekSummary {
    return sumRange(history.daily, startOfWeek(now), now)
}

/**
 * The share of breaks taken in each of the last `weeks` weeks, oldest first.
 *
 * A week with no breaks at all returns null rather than zero: a week on holiday
 * is not a week of skipping, and drawing it as a crash to the floor would say
 * something untrue.
 */
export function weeklyTrend(history: BreakHistory, now: Date, weeks = 8): (number | null)[] {
    const thisWeek = startOfWeek(now)
    const rates: (number | null)[] = []

    for (let back = weeks - 1; back >= 0; back--) {
        const from = new Date(thisWeek)
        from.setDate(from.getDate() - back * 7)
        const to = new Date(from)
        to.setDate(to.getDate() + 6)
        const { taken, offered } = sumRange(history.daily, from, to > now ? now : to)
        rates.push(offered === 0 ? null : taken / offered)
    }

    return rates
}

export interface HourRow {
    hour: number
    taken: number
    skipped: number
}

/**
 * Breaks by hour of day over the last `days`, for the hours that saw any.
 *
 * Only hours with breaks appear, which is what keeps this honest for someone
 * with a schedule: the app never offered a break at 3am, so 3am is not shown as
 * a perfect hour.
 */
export function hourBreakdown(history: BreakHistory, now: Date, days = 30): HourRow[] {
    const from = new Date(now)
    from.setDate(from.getDate() - days)
    const fromKey = dayKey(from)

    const totals = new Map<number, HourRow>()
    for (const [key, row] of Object.entries(history.daily)) {
        if (key < fromKey) continue
        for (const [hour, [taken, skipped]] of Object.entries(row.h)) {
            const index = Number(hour)
            const existing = totals.get(index) ?? { hour: index, taken: 0, skipped: 0 }
            existing.taken += taken
            existing.skipped += skipped
            totals.set(index, existing)
        }
    }

    return [...totals.values()].sort((a, b) => a.hour - b.hour)
}

/** Every break ever recorded, daily rows and folded months together. */
export function totalBreaks(history: BreakHistory): number {
    const daily = Object.values(history.daily).reduce((sum, row) => sum + row.t, 0)
    const monthly = Object.values(history.monthly).reduce((sum, row) => sum + row.t, 0)
    return daily + monthly
}

// The sentence -----------------------------------------------------------

/** Formats an hour the way a clock face would: "9am", "1pm", "12pm". */
export function formatHour(hour: number): string {
    const suffix = hour < 12 ? 'am' : 'pm'
    const display = hour % 12 === 0 ? 12 : hour % 12
    return `${display}${suffix}`
}

/**
 * The line under the headline count.
 *
 * Assembled from the numbers rather than written: every clause is switched on
 * by a threshold, so it can only ever say something the data supports. The
 * afternoon clause needs at least three skips and most of them past midday,
 * which is what keeps it from reading meaning into one bad Tuesday.
 */
export function summarySentence(summary: WeekSummary, hours: HourRow[]): string {
    const { taken, offered, skippedAfternoon } = summary
    if (offered === 0) return 'No breaks yet this week. The first one will show up here.'

    const missed = offered - taken
    if (missed === 0)
        return taken === 1 ? 'Breaks taken this week — the only one you were offered.' : 'Breaks taken this week. You took every one.'

    // One clause, not two: naming the hour already says it is the afternoon,
    // and "most of them after lunch. Most go by around 3pm." says it twice.
    const worst = worstHour(hours)
    const when =
        worst !== null
            ? ` Usually around ${formatHour(worst)}.`
            : missed >= 3 && skippedAfternoon / missed >= 0.6
              ? ' Mostly after lunch.'
              : ''

    return `Breaks taken this week. ${missed} went by while you kept working.${when}`
}

/**
 * The hour with the most skips, if one stands out.
 *
 * Needs three skips and a clear lead over second place; otherwise there is no
 * pattern to report and the sentence says nothing about hours.
 */
export function worstHour(hours: HourRow[]): number | null {
    const ranked = [...hours].filter((row) => row.skipped > 0).sort((a, b) => b.skipped - a.skipped)
    if (ranked.length === 0 || ranked[0].skipped < 3) return null
    if (ranked.length > 1 && ranked[1].skipped >= ranked[0].skipped) return null
    return ranked[0].hour
}
