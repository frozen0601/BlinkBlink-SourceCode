/**
 * Persistent storage.
 *
 * Everything read out of the store passes through the normalisers in
 * `core/settings` before it is handed to the rest of the app, so a store
 * written by an older version — or hand-edited, or truncated by a crash —
 * cannot put the timer into a state it does not know how to handle.
 */

import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { BrowserWindow, screen } from 'electron'
import { DaySchedule, DayKey, Settings, Stats, StoreSchema, TrayWindowPosition, WeeklySchedule } from '../core/types'
import { DEFAULT_SETTINGS, DEFAULT_STATS, normalizeSettings, normalizeStats } from '../core/settings'

/** Bumped whenever the on-disk shape changes in a way that needs migrating. */
export const CURRENT_SCHEMA_VERSION = 2

const STORE_DEFAULTS: StoreSchema = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    userId: '',
    settings: DEFAULT_SETTINGS,
    stats: DEFAULT_STATS,
    hasCompletedFirstRun: false,
    lastSeenVersion: '',
    lastBreakEndTime: 0,
    currentWorkStreakStartTime: 0,
    trayWindowPositions: {},
}

const store = new Store<StoreSchema>({ defaults: STORE_DEFAULTS })

const WINDOW_DEFAULTS: Record<string, { width: number; height: number }> = {
    stats: { width: 600, height: 660 },
    settings: { width: 800, height: 800 },
    about: { width: 420, height: 840 },
}

/**
 * Brings an older store forward.
 *
 * Version 1 (implicit, pre-migration) stored settings without `reminderStyle`
 * or `overlayBackdrop` and could hold out-of-range durations written before the
 * values were validated. Normalising is enough to move it to version 2.
 */
function migrate(): void {
    const version = store.get('schemaVersion', 0)
    if (version === CURRENT_SCHEMA_VERSION) return

    try {
        store.set('settings', normalizeSettings(store.get('settings'), DEFAULT_SETTINGS))
        store.set('stats', normalizeStats(store.get('stats')))
        store.set('schemaVersion', CURRENT_SCHEMA_VERSION)
        console.info(`[store] migrated from schema version ${version} to ${CURRENT_SCHEMA_VERSION}`)
    } catch (error) {
        console.error('[store] migration failed, falling back to defaults:', error)
        store.set('settings', DEFAULT_SETTINGS)
        store.set('stats', DEFAULT_STATS)
        store.set('schemaVersion', CURRENT_SCHEMA_VERSION)
    }
}

migrate()

// Stats -----------------------------------------------------------------

export function getStats(): Stats {
    return normalizeStats(store.get('stats'))
}

export function setStats(stats: Stats): void {
    store.set('stats', normalizeStats(stats))
}

// Settings --------------------------------------------------------------

export function getSettings(): Settings {
    return normalizeSettings(store.get('settings'), DEFAULT_SETTINGS)
}

/**
 * Merges a (possibly partial, possibly hostile) update into the stored
 * settings and returns the result that was actually persisted.
 */
export function updateSettings(update: unknown): Settings {
    const next = normalizeSettings(update, getSettings())
    store.set('settings', next)
    return next
}

export function getWorkDuration(): number {
    return getSettings().workDuration
}

export function getBreakDuration(): number {
    return getSettings().breakDuration
}

// Break bookkeeping -----------------------------------------------------

export function getLastBreakEndTime(): number {
    return store.get('lastBreakEndTime', 0)
}

export function updateLastBreakEndTime(timestamp: number): void {
    store.set('lastBreakEndTime', timestamp)
}

// Window positions ------------------------------------------------------

function defaultWindowPosition(windowName: string): TrayWindowPosition {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
    const dimensions = WINDOW_DEFAULTS[windowName] ?? { width: 400, height: 400 }

    return {
        x: Math.round((screenWidth - dimensions.width) / 2),
        y: Math.round((screenHeight - dimensions.height) / 2),
    }
}

/**
 * A remembered position, discarded if it no longer lands on a connected
 * display — otherwise unplugging a monitor strands the settings window
 * off-screen with no way to get it back.
 */
export function getWindowPosition(windowName: string): TrayWindowPosition {
    const saved = store.get('trayWindowPositions')?.[windowName]
    if (!saved || typeof saved.x !== 'number' || typeof saved.y !== 'number') {
        return defaultWindowPosition(windowName)
    }

    const onSomeDisplay = screen.getAllDisplays().some((display) => {
        const { x, y, width, height } = display.bounds
        return saved.x >= x - 50 && saved.x <= x + width - 50 && saved.y >= y - 50 && saved.y <= y + height - 50
    })

    return onSomeDisplay ? saved : defaultWindowPosition(windowName)
}

export function saveWindowPosition(window: BrowserWindow, windowName: string): void {
    if (window.isDestroyed()) return
    const { x, y } = window.getBounds()
    store.set(`trayWindowPositions.${windowName}`, { x, y })
}

// Schedule --------------------------------------------------------------

export function updateDaySchedule(day: DayKey, schedule: DaySchedule): Settings {
    const settings = getSettings()
    const nextSchedule: WeeklySchedule = { ...settings.schedule, [day]: schedule }
    return updateSettings({ ...settings, schedule: nextSchedule })
}

// First run -------------------------------------------------------------

export function hasCompletedFirstRun(): boolean {
    return store.get('hasCompletedFirstRun', false)
}

export function setFirstRunCompleted(): void {
    store.set('hasCompletedFirstRun', true)
}

// Release notes ---------------------------------------------------------

export function getLastSeenVersion(): string {
    return store.get('lastSeenVersion', '')
}

export function setLastSeenVersion(version: string): void {
    store.set('lastSeenVersion', version)
}

// Install identity ------------------------------------------------------

/**
 * A stable random identifier for this installation.
 *
 * Nothing transmits it today; it exists so that a future opt-in feature does
 * not have to invent one. Generated lazily with the platform CSPRNG.
 */
export function ensureUserId(): string {
    const existing = store.get('userId', '')
    if (existing) return existing

    const userId = randomUUID()
    store.set('userId', userId)
    return userId
}

/** Test/diagnostic escape hatch: where the JSON actually lives. */
export function getStorePath(): string {
    return store.path
}
