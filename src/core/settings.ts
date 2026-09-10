/**
 * Settings defaults, limits and normalisation.
 *
 * Settings reach the main process from two untrusted-ish directions: the
 * settings window over IPC, and the on-disk store written by an older version
 * of the app. Both are normalised through `normalizeSettings`, which coerces
 * types, clamps numbers into ranges the timer can actually honour, and drops
 * malformed schedule entries. Nothing downstream has to defend itself again.
 */

import { BackdropPreference, DAY_KEYS, DayKey, DaySchedule, ReminderStyle, Settings, Stats, TimeRange, WeeklySchedule } from './types'
import { formatTimeOfDay, parseTimeOfDay } from './schedule'

export const SECOND = 1000
export const MINUTE = 60 * SECOND

/**
 * Inclusive bounds for every numeric setting, in milliseconds.
 *
 * These are the values the app can actually behave sensibly at, not just what
 * the settings form happens to allow — a work duration of 0 would spin the
 * break overlay in a tight loop.
 */
export const SETTINGS_LIMITS = {
    workDuration: { min: 1 * MINUTE, max: 120 * MINUTE },
    breakDuration: { min: 5 * SECOND, max: 15 * MINUTE },
    summaryDuration: { min: 1 * SECOND, max: 60 * SECOND },
    breakPreNotificationOffset: { min: 5 * SECOND, max: 10 * MINUTE },
    idleThreshold: { min: 1 * MINUTE, max: 60 * MINUTE },
} as const

export const DEFAULT_SCHEDULE: WeeklySchedule = {
    monday: { enabled: true, timeRanges: [{ start: '09:00', end: '18:00' }] },
    tuesday: { enabled: true, timeRanges: [{ start: '09:00', end: '18:00' }] },
    wednesday: { enabled: true, timeRanges: [{ start: '09:00', end: '18:00' }] },
    thursday: { enabled: true, timeRanges: [{ start: '09:00', end: '18:00' }] },
    friday: { enabled: true, timeRanges: [{ start: '09:00', end: '18:00' }] },
    saturday: { enabled: false, timeRanges: [] },
    sunday: { enabled: false, timeRanges: [] },
}

export const DEFAULT_SETTINGS: Settings = {
    enableBreakNotification: true,
    // The OS notification centre is the default: it looks native, it stacks and
    // dismisses with everything else, and it does not paint a window over what
    // the user is doing. The cost on an unsigned macOS build is the "Skip this
    // break" button, which the OS will not draw — `in-app` is the setting for
    // anyone who wants that button back.
    reminderStyle: 'system',
    enableSoundNotification: true,
    notificationSound: 'system',
    breakPreNotificationOffset: 30 * SECOND,
    skipBreakWhenIdle: true,
    idleThreshold: 5 * MINUTE,
    enableAutoDismiss: true,
    summaryDuration: 5 * SECOND,
    scheduleEnabled: false,
    schedule: DEFAULT_SCHEDULE,
    startOnBoot: false,
    autoUpdate: false,
    workDuration: 20 * MINUTE,
    breakDuration: 20 * SECOND,
    overlayBackdrop: 'auto',
    language: 'en',
    enableAnalytics: true,
}

export const DEFAULT_STATS: Stats = {
    breakStreakCount: 0,
    breakStreakDuration: 0,
    streakStartTime: 0,
    highestStreakCount: 0,
    highestStreakDuration: 0,
    highestStreakStartTime: 0,
    highestStreakEndTime: 0,
}

const REMINDER_STYLES: readonly ReminderStyle[] = ['in-app', 'system']
const BACKDROP_PREFERENCES: readonly BackdropPreference[] = ['auto', 'translucent', 'solid']

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function toBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback
}

function toClampedNumber(value: unknown, fallback: number, limits: { min: number; max: number }): number {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return fallback
    return Math.round(clamp(numeric, limits.min, limits.max))
}

function toEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/**
 * Keeps a sound filename to a bare, safe basename.
 *
 * The value is joined onto the bundled sounds directory, so a stray `../` here
 * would turn a preference into a path traversal.
 */
export function normalizeSoundName(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback
    if (value === 'system') return value
    if (!/^[A-Za-z0-9._-]+\.wav$/.test(value)) return fallback
    if (value.startsWith('.')) return fallback
    return value
}

function normalizeTimeRange(value: unknown): TimeRange | null {
    if (!value || typeof value !== 'object') return null
    const candidate = value as Partial<TimeRange>
    if (typeof candidate.start !== 'string' || typeof candidate.end !== 'string') return null

    const start = parseTimeOfDay(candidate.start)
    const end = parseTimeOfDay(candidate.end)
    if (start === null || end === null) return null
    // A zero-length range would never fire; treat it as malformed.
    if (start === end) return null

    return { start: formatTimeOfDay(start), end: formatTimeOfDay(end) }
}

function normalizeDaySchedule(value: unknown, fallback: DaySchedule): DaySchedule {
    if (!value || typeof value !== 'object') return { enabled: fallback.enabled, timeRanges: [...fallback.timeRanges] }

    const candidate = value as Partial<DaySchedule>
    const enabled = toBoolean(candidate.enabled, fallback.enabled)
    const rawRanges = Array.isArray(candidate.timeRanges) ? candidate.timeRanges : []
    const timeRanges = rawRanges.map(normalizeTimeRange).filter((range): range is TimeRange => range !== null)

    // An enabled day with no usable ranges would silently never trigger a
    // break; fall back to the default working hours instead.
    if (enabled && timeRanges.length === 0) {
        return { enabled, timeRanges: fallback.timeRanges.length > 0 ? [...fallback.timeRanges] : [...DEFAULT_SCHEDULE.monday.timeRanges] }
    }

    return { enabled, timeRanges: enabled ? timeRanges : [] }
}

export function normalizeSchedule(value: unknown): WeeklySchedule {
    const source = (value && typeof value === 'object' ? value : {}) as Partial<Record<DayKey, unknown>>
    const result = {} as WeeklySchedule
    for (const key of DAY_KEYS) {
        result[key] = normalizeDaySchedule(source[key], DEFAULT_SCHEDULE[key])
    }
    return result
}

/**
 * Produces a complete, valid `Settings` from arbitrary input.
 *
 * `base` supplies the values to fall back on for anything missing or invalid —
 * usually the currently stored settings, so a partial update from the settings
 * window only changes what it actually sent.
 */
export function normalizeSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
    const raw = (input && typeof input === 'object' ? input : {}) as Partial<Settings>

    const workDuration = toClampedNumber(raw.workDuration, base.workDuration, SETTINGS_LIMITS.workDuration)

    // The reminder has to land inside the work interval, otherwise it is
    // scheduled in the past and silently never fires.
    const maxOffset = Math.min(
        SETTINGS_LIMITS.breakPreNotificationOffset.max,
        Math.max(SETTINGS_LIMITS.breakPreNotificationOffset.min, workDuration - SECOND)
    )
    const breakPreNotificationOffset = toClampedNumber(raw.breakPreNotificationOffset, base.breakPreNotificationOffset, {
        min: SETTINGS_LIMITS.breakPreNotificationOffset.min,
        max: maxOffset,
    })

    return {
        enableBreakNotification: toBoolean(raw.enableBreakNotification, base.enableBreakNotification),
        reminderStyle: toEnum(raw.reminderStyle, REMINDER_STYLES, base.reminderStyle),
        enableSoundNotification: toBoolean(raw.enableSoundNotification, base.enableSoundNotification),
        notificationSound: normalizeSoundName(raw.notificationSound, base.notificationSound),
        breakPreNotificationOffset,
        skipBreakWhenIdle: toBoolean(raw.skipBreakWhenIdle, base.skipBreakWhenIdle),
        idleThreshold: toClampedNumber(raw.idleThreshold, base.idleThreshold, SETTINGS_LIMITS.idleThreshold),
        enableAutoDismiss: toBoolean(raw.enableAutoDismiss, base.enableAutoDismiss),
        summaryDuration: toClampedNumber(raw.summaryDuration, base.summaryDuration, SETTINGS_LIMITS.summaryDuration),
        scheduleEnabled: toBoolean(raw.scheduleEnabled, base.scheduleEnabled),
        schedule: normalizeSchedule(raw.schedule ?? base.schedule),
        startOnBoot: toBoolean(raw.startOnBoot, base.startOnBoot),
        autoUpdate: toBoolean(raw.autoUpdate, base.autoUpdate),
        workDuration,
        breakDuration: toClampedNumber(raw.breakDuration, base.breakDuration, SETTINGS_LIMITS.breakDuration),
        overlayBackdrop: toEnum(raw.overlayBackdrop, BACKDROP_PREFERENCES, base.overlayBackdrop),
        language: typeof raw.language === 'string' && raw.language.length > 0 ? raw.language : base.language,
        // A store written before 0.2.0 has no such key, so this reads as the
        // default — which is on. That is the deliberate choice, not an
        // oversight: analytics are opt-out, and the tutorial says so.
        enableAnalytics: toBoolean(raw.enableAnalytics, base.enableAnalytics),
    }
}

export function normalizeStats(input: unknown): Stats {
    const raw = (input && typeof input === 'object' ? input : {}) as Partial<Stats>
    const positive = (value: unknown, fallback: number) => {
        const numeric = typeof value === 'number' ? value : Number(value)
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback
    }

    return {
        breakStreakCount: positive(raw.breakStreakCount, DEFAULT_STATS.breakStreakCount),
        breakStreakDuration: positive(raw.breakStreakDuration, DEFAULT_STATS.breakStreakDuration),
        streakStartTime: positive(raw.streakStartTime, DEFAULT_STATS.streakStartTime),
        highestStreakCount: positive(raw.highestStreakCount, DEFAULT_STATS.highestStreakCount),
        highestStreakDuration: positive(raw.highestStreakDuration, DEFAULT_STATS.highestStreakDuration),
        highestStreakStartTime: positive(raw.highestStreakStartTime, DEFAULT_STATS.highestStreakStartTime),
        highestStreakEndTime: positive(raw.highestStreakEndTime, DEFAULT_STATS.highestStreakEndTime),
    }
}
