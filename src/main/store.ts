// src/store.ts

import Store from 'electron-store'
import { BrowserWindow, screen } from 'electron'
import { StoreSchema, Settings, Stats, TrayWindowPosition } from './types'

// Store instance and defaults (now private to this module)
const STORE_DEFAULTS: StoreSchema = {
    stats: {
        breakStreakCount: 0,
        breakStreakDuration: 0,
        streakStartTime: Date.now(),
        highestStreakCount: 0,
        highestStreakDuration: 0,
        highestStreakStartTime: Date.now(),
        highestStreakEndTime: Date.now(),
    },
    lastBreakEndTime: Date.now(),
    currentWorkStreakStartTime: Date.now(),
    settings: {
        startOnBoot: false,
        enableAutoDismiss: true,
        summaryDuration: 5000,
        enableBreakNotification: true,
        breakPreNotificationOffset: 30000,
        language: 'en',
    },
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

// Settings management
export function getSettings(): Settings {
    const settings = store.get('settings')
    if (!settings) {
        store.set('settings', STORE_DEFAULTS.settings)
        return STORE_DEFAULTS.settings!
    }

    // Always merge with defaults to ensure all fields exist with valid values
    return {
        ...STORE_DEFAULTS.settings,
        ...settings,
    }
}

export function updateSettings(updates: Partial<Settings>) {
    const current = getSettings()
    store.set('settings', { ...current, ...updates })
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
