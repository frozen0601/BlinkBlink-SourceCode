// src/store.ts

import Store from 'electron-store'
import { BrowserWindow, screen } from 'electron'
import { updateTooltip } from './tray'
import { StoreSchema, Settings, Stats, TrayWindowPosition, WeeklySchedule, DaySchedule } from './types'
import { startAutoUpdateTimer, stopAutoUpdateTimer } from './updater'
import { v4 as uuidv4 } from 'uuid'

const DEFAULT_SCHEDULE: WeeklySchedule = {
    monday: { enabled: true, timeRanges: [{ start: '09:00', end: '18:00' }] },
    tuesday: { enabled: true, timeRanges: [{ start: '09:00', end: '18:00' }] },
    wednesday: { enabled: true, timeRanges: [{ start: '09:00', end: '18:00' }] },
    thursday: { enabled: true, timeRanges: [{ start: '09:00', end: '18:00' }] },
    friday: { enabled: true, timeRanges: [{ start: '09:00', end: '18:00' }] },
    saturday: { enabled: false, timeRanges: [] },
    sunday: { enabled: false, timeRanges: [] },
}

// Store instance and defaults (now private to this module)
const STORE_DEFAULTS: StoreSchema = {
    userId: uuidv4(),
    settings: {
        enableBreakNotification: true,
        enableSoundNotification: true,
        notificationSound: 'system',
        breakPreNotificationOffset: 30000,
        enableAutoDismiss: true,
        summaryDuration: 5000,
        scheduleEnabled: false,
        schedule: DEFAULT_SCHEDULE,
        startOnBoot: false,
        autoUpdate: false,
        language: 'en',
    },
    stats: {
        breakStreakCount: 0,
        breakStreakDuration: 0,
        streakStartTime: Date.now(),
        highestStreakCount: 0,
        highestStreakDuration: 0,
        highestStreakStartTime: Date.now(),
        highestStreakEndTime: Date.now(),
    },
    hasCompletedFirstRun: false,
    lastBreakEndTime: Date.now(),
    currentWorkStreakStartTime: Date.now(),
    trayWindowPositions: {},
}

const store = new Store<StoreSchema>({
    defaults: STORE_DEFAULTS,
})

const WINDOW_DEFAULTS = {
    stats: { width: 600, height: 650 },
    settings: { width: 400, height: 450 },
    about: { width: 430, height: 750 },
}

// Stats management
export function getStats(): Stats {
    return store.get('stats')
}

export function updateStats(newStats: Partial<Stats>) {
    const currentStats = store.get('stats')
    store.set('stats', { ...currentStats, ...newStats })
}

// Modify getSettings function
function isDayOfWeek(day: string): day is keyof WeeklySchedule {
    return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(day)
}

export function getSettings(): Settings {
    const settings = store.get('settings')
    const defaultSettings = STORE_DEFAULTS.settings!

    if (!settings) {
        store.set('settings', defaultSettings)
        return defaultSettings
    }

    // Ensure schedule exists and has all required properties
    const schedule = settings.schedule || DEFAULT_SCHEDULE
    Object.keys(DEFAULT_SCHEDULE).forEach((day) => {
        if (isDayOfWeek(day)) {
            // Type guard
            if (!schedule[day]) {
                schedule[day] = DEFAULT_SCHEDULE[day]
            }
            // Ensure each day has the correct structure
            if (typeof schedule[day].enabled !== 'boolean') {
                schedule[day].enabled = DEFAULT_SCHEDULE[day].enabled
            }
            if (!Array.isArray(schedule[day].timeRanges)) {
                schedule[day].timeRanges = DEFAULT_SCHEDULE[day].timeRanges
            }
        }
    })

    // Merge with defaults to ensure all properties exist
    return {
        ...defaultSettings,
        ...settings,
        schedule,
    }
}

export function updateSettings(settings: Partial<Settings>) {
    const current = getSettings()
    const autoUpdateChanged = current.autoUpdate !== settings.autoUpdate

    if (autoUpdateChanged) {
        if (settings.autoUpdate) {
            startAutoUpdateTimer()
        } else {
            stopAutoUpdateTimer()
        }
    }
    store.set('settings', { ...current, ...settings })

    // Trigger timer and tooltip updates when schedule changes
    const { ipcMain } = require('electron')
    ipcMain.emit('schedule-updated')

    updateTooltip()
}

// Last break time management
export function getLastBreakEndTime(): number {
    return store.get('lastBreakEndTime')
}

export function updateLastBreakEndTime(timestamp: number) {
    store.set('lastBreakEndTime', timestamp)
}

// Window position management
export function getWindowPosition(windowName: string): TrayWindowPosition {
    function getDefaultWindowPosition(): TrayWindowPosition {
        const primaryDisplay = screen.getPrimaryDisplay()
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
        const windowDimensions = WINDOW_DEFAULTS[windowName as keyof typeof WINDOW_DEFAULTS] || { width: 400, height: 400 }

        return {
            x: Math.round((screenWidth - windowDimensions.width) / 2),
            y: Math.round((screenHeight - windowDimensions.height) / 2),
        }
    }

    return store.get(`trayWindowPositions.${windowName}`) ?? getDefaultWindowPosition()
}

export function saveWindowPosition(window: BrowserWindow, windowName: string) {
    if (!window.isDestroyed()) {
        const { x, y } = window.getBounds()
        store.set(`trayWindowPositions.${windowName}`, { x, y } as TrayWindowPosition)
    }
}

// Schedule management
export function updateDaySchedule(day: keyof WeeklySchedule, schedule: DaySchedule) {
    const settings = getSettings()
    settings.schedule[day] = schedule
    updateSettings(settings)
}

// First run flag management
export function hasCompletedFirstRun(): boolean {
    return store.get('hasCompletedFirstRun')
}

export function setFirstRunCompleted() {
    store.set('hasCompletedFirstRun', true)
}

// User ID management
export function getUserId(): string {
    return store.get('userId')
}

export function ensureUserId(): string {
    const userId = getUserId()
    if (!userId) {
        const newUserId = uuidv4()
        store.set('userId', newUserId)
        return newUserId
    }
    return userId
}
