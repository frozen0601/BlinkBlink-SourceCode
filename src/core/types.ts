import type { BreakHistory } from './breakHistory'

/**
 * Shared data types.
 *
 * This module is deliberately free of any Electron import so that it can be
 * consumed by the main process, the preload script, renderer bundles and the
 * unit tests alike.
 */

export interface Stats {
    breakStreakCount: number
    breakStreakDuration: number
    streakStartTime: number
    highestStreakCount: number
    highestStreakDuration: number
    highestStreakStartTime: number
    highestStreakEndTime: number
}

/** How the break overlay paints the area behind its content. */
export type BackdropMode =
    /** macOS native vibrancy: the compositor blurs what is behind the window. */
    | 'vibrancy'
    /** Windows 11 22H2+ DWM acrylic backdrop. */
    | 'acrylic'
    /** Translucent scrim over a transparent window; no real blur available. */
    | 'translucent'
    /** Fully opaque window. The always-works fallback. */
    | 'solid'

/** User-facing preference for the overlay backdrop; `auto` resolves per platform. */
export type BackdropPreference = 'auto' | 'translucent' | 'solid'

/** How the pre-break reminder is delivered. */
export type ReminderStyle =
    /** BlinkBlink's own toast window. Looks and behaves the same everywhere. */
    | 'in-app'
    /** The OS notification centre. Subject to platform permissions and signing. */
    | 'system'

export interface Settings {
    enableBreakNotification: boolean
    /** Which delivery mechanism the pre-break reminder uses. */
    reminderStyle: ReminderStyle
    enableSoundNotification: boolean
    notificationSound: string
    breakPreNotificationOffset: number
    enableAutoDismiss: boolean
    summaryDuration: number
    scheduleEnabled: boolean
    schedule: WeeklySchedule
    startOnBoot: boolean
    autoUpdate: boolean
    workDuration: number
    breakDuration: number
    /** Overlay backdrop preference. `auto` picks the best mode for the platform. */
    overlayBackdrop: BackdropPreference
    language: string
    /** Send the anonymous launch event. On by default; see `core/analytics.ts`. */
    enableAnalytics: boolean
}

export interface TrayWindowPosition {
    x: number
    y: number
}

export interface TimeRange {
    /** 24-hour local wall-clock time, "HH:mm". */
    start: string
    /** 24-hour local wall-clock time, "HH:mm". A value <= `start` wraps past midnight. */
    end: string
}

export interface DaySchedule {
    enabled: boolean
    timeRanges: TimeRange[]
}

export const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

export type DayKey = (typeof DAY_KEYS)[number]

export type WeeklySchedule = Record<DayKey, DaySchedule>

/**
 * Root schema for persistent storage. `schemaVersion` lets `store.ts` migrate
 * older on-disk shapes forward instead of silently reading nonsense.
 */
export interface StoreSchema {
    schemaVersion: number
    userId: string
    settings: Settings
    stats: Stats
    hasCompletedFirstRun: boolean
    /** Day-by-day break record; see `core/breakHistory.ts`. */
    history: BreakHistory
    /** The version whose release note has been shown. Empty until one is. */
    lastSeenVersion: string
    /** The version a background update check has already announced. */
    lastAnnouncedVersion: string
    lastBreakEndTime: number
    currentWorkStreakStartTime: number
    trayWindowPositions: Record<string, TrayWindowPosition>
}
