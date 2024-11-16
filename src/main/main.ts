import { app, BrowserWindow, ipcMain, nativeTheme, powerMonitor, Notification } from 'electron'
import * as path from 'path'
import { updateStats, updateLastBreakEndTime, getSettings, updateSettings, getStats } from './store'
import { Settings } from './types'
import * as fs from 'fs'
import { startWorkTimer, clearTimer, isRunning } from './timer'
import { showBreakView, showSummaryView, closeAllWindows } from './windows'
import { DURATIONS } from './constants'
import { createTray, destroyTray, updateTooltip } from './tray'
import { checkForUpdates } from './updater'

// Stats Management
export function updateBreakStats(skipped: boolean) {
    const stats = getStats()
    const currentTime = Date.now()

    if (skipped) {
        // Reset current streak but preserve highest
        updateStats({
            ...stats,
            breakStreakCount: 0,
            breakStreakDuration: 0,
            streakStartTime: currentTime,
        })
    } else {
        // Completing a break successfully
        const newCount = stats.breakStreakCount + 1
        const newDuration = stats.breakStreakDuration + DURATIONS.WORK_DURATION

        const updatedStats = {
            ...stats,
            breakStreakCount: newCount,
            breakStreakDuration: newDuration,
        }

        // Update highest streak if current is higher
        if (newCount > stats.highestStreakCount) {
            updatedStats.highestStreakCount = newCount
            updatedStats.highestStreakDuration = newDuration
            updatedStats.highestStreakStartTime = stats.streakStartTime
            updatedStats.highestStreakEndTime = currentTime
        }

        updateStats(updatedStats)
    }
    updateLastBreakEndTime(currentTime)
}

function getIconPath() {
    return process.platform === 'win32'
        ? path.join(__dirname, 'icon.ico')
        : process.platform === 'darwin'
        ? path.join(__dirname, 'icon.icns')
        : path.join(__dirname, 'icon.png')
}

function createWindow(options: Electron.BrowserWindowConstructorOptions, filePath: string, onClose: () => void) {
    const window = new BrowserWindow({
        ...options,
        show: false, // Don't show the window immediately
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#f5f5f5',
        icon: getIconPath(),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    })

    window.loadFile(path.join(__dirname, filePath))
    window.on('closed', onClose)

    // Show the window once it's ready
    window.once('ready-to-show', () => {
        window.show()
    })

    return window
}

// Simplified IPC handlers
ipcMain.on('start-break-countdown', () => {
    if (isRunning()) {
        showBreakView()
    }
})

ipcMain.on('break-skip', () => {
    updateBreakStats(true)
    closeAllWindows()
    startWorkTimer()
})

ipcMain.on('break-complete', () => {
    updateBreakStats(false)
    showSummaryView()
})

ipcMain.on('summary-dismissed', () => {
    startWorkTimer()
    closeAllWindows()
})

ipcMain.on('show-break-notification', () => {
    const settings = getSettings()
    const notifier = require('node-notifier')
    console.log("reminder")
    notifier.notify({
        title: 'My notification',
        message: 'Hello, there!',
        icon: path.join(__dirname, 'icon.png'),
    })
})

// Data access handlers
ipcMain.handle('get-stats', () => getStats())
ipcMain.handle('get-settings', () => getSettings())

// IPC Handler - get app info from package.json
ipcMain.handle('get-app-info', () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    return {
        version: packageJson.version,
        author: packageJson.author,
        description: packageJson.description,
        license: packageJson.license,
        website: packageJson.homepage,
        supportEmail: 'theblinkblinkapp@gmail.com',
    }
})

// IPC Handler - Check for updates (manual check)
ipcMain.handle('check-for-updates', () => checkForUpdates(false))

// IPC Handlers - Settings
ipcMain.on('save-settings', (event, settings: Settings) => {
    updateSettings(settings)

    // Configure auto-start behavior
    app.setLoginItemSettings({
        openAtLogin: settings.startOnBoot,
        openAsHidden: true,
        path: app.getPath('exe'),
    })
})

// App Lifecycle Events
app.whenReady().then(() => {
    if (process.platform === 'win32') {
        app.setAppUserModelId('BlinkBLink')
    }
    if (process.platform === 'darwin') app.dock.hide()
    createTray()
    startWorkTimer()
    updateTooltip()

    // Automatically check for updates on startup
    checkForUpdates(true)

    // Initialize auto-start setting based on stored preference
    const settings = getSettings()
    app.setLoginItemSettings({
        openAtLogin: settings?.startOnBoot || false,
        openAsHidden: true,
        path: app.getPath('exe'),
    })

    // Handle system resume events
    powerMonitor.on('resume', () => {
        startWorkTimer()
    })

    powerMonitor.on('unlock-screen', () => {
        startWorkTimer()
    })
})

app.on('window-all-closed', () => {
    // Keep the app running in the tray
})
destroyTray()

// Gracefully handle app quitting
app.on('before-quit', () => {
    clearTimer()
    closeAllWindows()
    destroyTray()
})
