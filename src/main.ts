// src/main.ts

import { app, BrowserWindow, Tray, Menu, ipcMain, screen } from 'electron'
import * as path from 'path'
import Store from 'electron-store'
import { StoreSchema, Settings } from './storeTypes'

let mainWindow: BrowserWindow | null = null
let overlayWindows: BrowserWindow[] = []
let statsWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null

// Flag to prevent multiple timers
let isTimerRunning: boolean = false

const store = new Store<StoreSchema>({
    defaults: {
        stats: {
            totalWorkTimeToday: 0,
            totalBreakTimeToday: 0,
            breaksTakenToday: 0,
            longestWorkStreak: 0,
        },
        lastBreakEndTime: Date.now(),
        currentWorkStreakStartTime: Date.now(),
        settings: {
            startOnBoot: false,
            enableAnimations: true,
            language: 'en',
        },
    },
})

function createMainWindow() {
    mainWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    })
}

function createOverlayWindow() {
    const displays = screen.getAllDisplays()
    displays.forEach((display) => {
        const { width, height, x, y } = display.bounds

        const overlay = new BrowserWindow({
            x,
            y,
            width,
            height,
            transparent: true,
            frame: false,
            alwaysOnTop: true,
            opacity: 0.85, // Adjusted for frosty effect
            fullscreen: false, // Managed via width and height
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        })

        overlay.loadFile(path.join(__dirname, 'overlay.html'))

        // Set always on top with 'floating' level to maintain highest z-order
        overlay.setAlwaysOnTop(true, 'floating')

        // Ensure the overlay stays on top even when blurred
        overlay.on('blur', () => {
            overlay.setAlwaysOnTop(true, 'floating')
        })

        overlay.on('closed', () => {
            overlayWindows = overlayWindows.filter((win) => win !== overlay)
        })

        overlayWindows.push(overlay)
    })
}

function createTray() {
    tray = new Tray(path.join(__dirname, 'icon.png'))
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Pause Timer', type: 'normal', click: pauseTimer },
        {
            label: 'Skip Breaks',
            submenu: [
                { label: '5 minutes', click: () => skipBreaks(5) },
                { label: '10 minutes', click: () => skipBreaks(10) },
                { label: '30 minutes', click: () => skipBreaks(30) },
                { label: 'Rest of the day', click: () => skipBreaksUntilEndOfDay() },
            ],
        },
        { label: 'View Stats', click: viewStats },
        { label: 'Settings', click: openSettings },
        { label: 'Exit', click: () => app.quit() },
    ])

    tray.setToolTip('BlinkBlink')
    tray.setContextMenu(contextMenu)
}

let workTimer: NodeJS.Timeout

function startWorkTimer() {
    if (isTimerRunning) {
        return
    }

    isTimerRunning = true

    const now = Date.now()
    const lastBreakEndTime = store.get('lastBreakEndTime') as number
    const currentStreak = now - lastBreakEndTime

    if (currentStreak > store.get('stats').longestWorkStreak) {
        store.set('stats.longestWorkStreak', currentStreak)
    }

    store.set('currentWorkStreakStartTime', now)

    workTimer = setTimeout(() => {
        showOverlay()
    // }, 20 * 60 * 1000) // 20 minutes
    // For testing:
    }, 10 * 1000); // 10 seconds
}

function showOverlay() {
    createOverlayWindow()

    const currentWorkStartTime = store.get('currentWorkStreakStartTime') as number
    const workDuration = Date.now() - currentWorkStartTime
    const totalWorkTime = store.get('stats').totalWorkTimeToday + workDuration
    store.set('stats.totalWorkTimeToday', totalWorkTime)
}

function pauseTimer() {
    clearTimeout(workTimer)
    isTimerRunning = false
}

function skipBreaks(minutes: number) {
    clearTimeout(workTimer)
    isTimerRunning = false
    setTimeout(startWorkTimer, minutes * 60 * 1000)
}

function skipBreaksUntilEndOfDay() {
    clearTimeout(workTimer)
    isTimerRunning = false
    const now = new Date()
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)
    const millisUntilEOD = endOfDay.getTime() - now.getTime()
    setTimeout(startWorkTimer, millisUntilEOD)
}

function viewStats() {
    if (statsWindow) {
        statsWindow.focus()
        return
    }

    statsWindow = new BrowserWindow({
        width: 400,
        height: 300,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    })

    statsWindow.loadFile(path.join(__dirname, 'stats.html'))

    statsWindow.on('closed', () => {
        statsWindow = null
    })
}

function openSettings() {
    if (settingsWindow) {
        settingsWindow.focus()
        return
    }

    settingsWindow = new BrowserWindow({
        width: 400,
        height: 300,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    })

    settingsWindow.loadFile(path.join(__dirname, 'settings.html'))

    settingsWindow.on('closed', () => {
        settingsWindow = null
    })
}

app.whenReady().then(() => {
    createMainWindow()
    createTray()
    startWorkTimer()
})

app.on('window-all-closed', () => {
    // Keep the app running in the tray
})

ipcMain.handle('get-stats', () => {
    return store.get('stats')
})

ipcMain.on('break-ended', () => {
    if (!isTimerRunning) {
        return
    }

    isTimerRunning = false

    const now = Date.now()
    const stats = store.get('stats')

    if (!stats) {
        console.error('Stats not found in store.')
        return
    }

    const totalBreakTime = stats.totalBreakTimeToday + 20 * 1000 // Assuming 20 seconds
    const breaksTaken = stats.breaksTakenToday + 1

    store.set('stats.totalBreakTimeToday', totalBreakTime)
    store.set('stats.breaksTakenToday', breaksTaken)
    store.set('lastBreakEndTime', now)

    // Close all overlay windows
    overlayWindows.forEach((win) => {
        if (!win.isDestroyed()) {
            win.close()
        }
    })
    overlayWindows = []

    // Restart the work timer
    startWorkTimer()
})

ipcMain.handle('get-settings', () => {
    return (
        store.get('settings') || {
            startOnBoot: false,
            enableAnimations: true,
            language: 'en',
        }
    )
})

ipcMain.on('save-settings', (event, settings: Settings) => {
    store.set('settings', settings)
    // Implement startup behavior if necessary
})
