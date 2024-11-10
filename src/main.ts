import { app, BrowserWindow, Tray, Menu, ipcMain, screen } from 'electron' // Added 'screen' import
import * as path from 'path'
import Store from 'electron-store'
import { StoreSchema, Settings } from './storeTypes'
import * as fs from 'fs' // Add this import at the top
import {
    startWorkTimer,
    skipBreak,
    completeBreak,
    dismissDashboard,
    pauseTimer,
    skipBreaks,
    skipBreaksUntilEndOfDay,
    getCurrentState,
    isRunning,
} from './timer'
import { showOverlay, closeOverlayWindows, showDashboard, closeDashboardWindows } from './windows'
import { DURATIONS } from './constants'

let mainWindow: BrowserWindow | null = null
let statsWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let aboutWindow: BrowserWindow | null = null // Declare globally

const store = new Store<StoreSchema>({
    defaults: {
        stats: {
            breakStreakCount: 0,
            breakStreakDuration: 0,
        },
        lastBreakEndTime: Date.now(),
        currentWorkStreakStartTime: Date.now(),
        settings: {
            startOnBoot: false,
            enableAnimations: true,
            language: 'en',
            enableAutoDismiss: true,
            dashboardDuration: 5000,
        },
    },
})

// Stats Management
function updateBreakStats(skipped: boolean) {
    const stats = store.get('stats')
    const updatedStats = {
        ...stats,
        breakStreakDuration: skipped ? 0 : stats.breakStreakDuration + DURATIONS.BREAK_DURATION,
        breakStreakCount: skipped ? 0 : stats.breakStreakCount + 1,
    }
    store.set('stats', updatedStats)
}

// Window Creation Methods
function createMainWindow() {
    mainWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    })
}

function createStatsWindow() {
    if (statsWindow) {
        statsWindow.focus()
        return
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    statsWindow = new BrowserWindow({
        width: Math.min(500, width * 0.5),
        height: Math.min(400, height * 0.5),
        resizable: true,
        center: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        autoHideMenuBar: true,
    })
    statsWindow.loadFile(path.join(__dirname, 'stats.html'))

    statsWindow.on('closed', () => {
        statsWindow = null
    })
}

function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus()
        return
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    settingsWindow = new BrowserWindow({
        width: Math.min(500, width * 0.5),
        height: Math.min(400, height * 0.5),
        resizable: true,
        center: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        autoHideMenuBar: true,
    })
    settingsWindow.loadFile(path.join(__dirname, 'settings.html'))

    settingsWindow.on('closed', () => {
        settingsWindow = null
    })
}

function createAboutWindow() {
    if (aboutWindow) {
        aboutWindow.focus()
        return
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    aboutWindow = new BrowserWindow({
        width: Math.min(500, width * 0.5),
        height: Math.min(400, height * 0.5),
        resizable: true,
        center: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        autoHideMenuBar: true,
    })
    aboutWindow.loadFile(path.join(__dirname, 'about.html'))
    aboutWindow.on('closed', () => {
        aboutWindow = null
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
                { label: 'Rest of the day', click: skipBreaksUntilEndOfDay },
            ],
        },
        { label: 'View Stats', click: createStatsWindow },
        { label: 'Settings', click: createSettingsWindow },
        { label: 'About', click: createAboutWindow },
        { label: 'Exit', click: () => app.quit() },
    ])
    tray.setToolTip('BlinkBlink')
    tray.setContextMenu(contextMenu)
}

// IPC Handlers - Timer Events
ipcMain.on('start-break-countdown', () => {
    if (isRunning()) {
        showOverlay()
    }
})

ipcMain.on('break-skip', () => {
    skipBreak()
    closeOverlayWindows()
    updateBreakStats(true)
    startWorkTimer()
})

ipcMain.on('break-complete', () => {
    completeBreak()
    closeOverlayWindows()
    updateBreakStats(false)
    showDashboard()
})

ipcMain.on('dashboard-dismissed', () => {
    dismissDashboard()
    startWorkTimer()
    closeDashboardWindows()
})

// IPC Handlers - Data Access
ipcMain.handle('get-stats', () => {
    return store.get('stats')
})

ipcMain.handle('get-settings', () => {
    return (
        store.get('settings') || {
            startOnBoot: false,
            enableAnimations: true,
            language: 'en',
            enableAutoDismiss: true,
        }
    )
})

// Update the 'get-app-info' IPC handler to match support email
ipcMain.handle('get-app-info', () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    return {
        version: packageJson.version,
        author: packageJson.author,
        description: packageJson.description,
        license: packageJson.license,
        website: packageJson.homepage || 'https://yourwebsite.com',
        supportEmail: 'theblinkblinkapp@gmail.com', // Updated support email
    }
})

// IPC Handlers - Settings
ipcMain.on('save-settings', (event, settings: Settings) => {
    store.set('settings', settings)
    // Implement startup behavior if necessary
})

// App Lifecycle Events
app.whenReady().then(() => {
    createMainWindow()
    createTray()
    startWorkTimer()
})

app.on('window-all-closed', () => {
    // Keep the app running in the tray
})

// Gracefully handle app quitting
app.on('before-quit', () => {
    pauseTimer() // Ensure timers are cleared and state is reset
    closeOverlayWindows()
    closeDashboardWindows()
    if (statsWindow) statsWindow.close()
    if (settingsWindow) settingsWindow.close()
    if (mainWindow) mainWindow.close()
})
