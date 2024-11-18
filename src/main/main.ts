import { app, ipcMain, powerMonitor, nativeImage } from 'electron'
import * as path from 'path'
import { updateStats, updateLastBreakEndTime, getSettings, updateSettings, getStats } from './store'
import { Settings } from './types'
import * as fs from 'fs'
import { startWorkTimer, clearTimer, isRunning } from './timer'
import { showBreakView, showSummaryView, closeAllWindows } from './windows'
import { DURATIONS } from './constants'
import { createTray, destroyTray, updateTooltip } from './tray'
import { checkForUpdates, startAutoUpdateTimer, stopAutoUpdateTimer } from './updater'

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

// Add this new IPC handler for schedule updates
ipcMain.on('schedule-updated', () => {
    clearTimer() // Clear existing timer
    startWorkTimer() // Restart timer with new schedule
    updateTooltip()
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
    const currentSettings = getSettings()

    updateSettings(settings)

    // Configure auto-start behavior
    app.setLoginItemSettings({
        openAtLogin: settings.startOnBoot,
        openAsHidden: true,
        path: app.getPath('exe'),
    })

    // Only handle auto-update timer if the setting changed

})

// App Lifecycle Events
app.whenReady().then(() => {
    // Ensure settings are initialized with defaults
    const settings = getSettings()

    if (process.platform === 'win32') {
        app.setAppUserModelId('BlinkBLink')
    }
    if (process.platform === 'darwin') {
        const appIcon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'))
        app.dock.setIcon(appIcon)
        app.dock.hide()
        app.setActivationPolicy('regular')
    }
    createTray()
    startWorkTimer()
    updateTooltip()

    // Replace the single update check with the timer-based system
    startAutoUpdateTimer()

    // Initialize auto-start setting based on stored preference
    app.setLoginItemSettings({
        openAtLogin: settings?.startOnBoot || false,
        openAsHidden: true,
        path: app.getPath('exe'),
    })

    // Handle system resume events
    powerMonitor.on('resume', () => {
        startWorkTimer()
        updateTooltip()
    })

    powerMonitor.on('unlock-screen', () => {
        startWorkTimer()
        updateTooltip()
    })
})

app.on('window-all-closed', () => {
    // Keep the app running in the tray
})
destroyTray()

// Gracefully handle app quitting
app.on('before-quit', () => {
    stopAutoUpdateTimer()
    clearTimer()
    closeAllWindows()
    destroyTray()
})
