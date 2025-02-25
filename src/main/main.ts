import { app, ipcMain, powerMonitor, nativeImage } from 'electron'
import * as path from 'path'
import { updateStats, updateLastBreakEndTime, getSettings, getWorkDuration, updateSettings, getStats, hasCompletedFirstRun } from './store'
import { Settings } from './types'
import * as fs from 'fs'
import { startWorkTimer, clearTimer, isRunning } from './timer'
import { showBreakView, showSummaryView, closeAllWindows } from './windows'
import { createTray, destroyTray, updateTooltip } from './tray'
import { checkForUpdates, startAutoUpdateTimer, stopAutoUpdateTimer } from './updater'
import { initialize, trackEvent } from '@aptabase/electron/main'
import { showTutorial } from './tutorial'
import { playNotificationSound, getAvailableSounds } from './sound'

// Stats Management
export function updateBreakStats(skipped: boolean) {
    trackEvent('break_action', {
        type: skipped ? 'skipped' : 'completed',
        streak_count: getStats().breakStreakCount,
    })
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
        const newDuration = stats.breakStreakDuration + getWorkDuration()

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
    updateTooltip()
})

ipcMain.on('break-complete', () => {
    const settings = getSettings()
    if (settings.enableSoundNotification) {
        playNotificationSound(settings.notificationSound)
    }
    updateBreakStats(false)
    showSummaryView()
    updateTooltip()
})

ipcMain.on('summary-dismissed', () => {
    startWorkTimer()
    closeAllWindows()
    updateTooltip()
})

ipcMain.on('schedule-updated', () => {
    clearTimer()
    startWorkTimer()
    updateTooltip()
})

// Add this new IPC handler for sound testing
ipcMain.on('play-sound', (event, soundValue) => {
    playNotificationSound(soundValue)
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

// Update the IPC handler to use imported function
ipcMain.handle('get-available-sounds', () => getAvailableSounds())

function trackSettingsState(settings: Settings) {
    trackEvent('settings_values', {
        startOnBoot: settings.startOnBoot ? 1 : 0,
        autoDismiss: settings.enableAutoDismiss ? 1 : 0,
        summaryDuration: settings.summaryDuration,
        breakNotification: settings.enableBreakNotification ? 1 : 0,
        breakNotificationOffset: settings.breakPreNotificationOffset,
        scheduleEnabled: settings.scheduleEnabled ? 1 : 0,
        autoUpdate: settings.autoUpdate ? 1 : 0,
        soundNotification: settings.enableSoundNotification ? 1 : 0,
        notificationSound: settings.notificationSound,
    })
    // we track the language setting separately as being a string value mess up aptabase dashboard
    // trackEvent('language_setting', {
    //     value: settings.language,
    // })
}

// IPC Handlers - Settings
ipcMain.on('save-settings', (event, settings: Partial<Settings>) => {
    updateSettings(settings)
    trackSettingsState(getSettings())

    // Configure auto-start behavior
    app.setLoginItemSettings({
        openAtLogin: settings.startOnBoot,
        openAsHidden: true,
        path: app.getPath('exe'),
    })
})

// App Lifecycle Events
initialize('process.env.APTABASE_API_KEY')
app.whenReady().then(() => {
    const firstRun = !hasCompletedFirstRun()

    trackEvent('app_started', {
        platform: process.platform,
        version: app.getVersion(),
        first_run: firstRun ? 1 : 0,
    })

    const settings = getSettings()
    if (firstRun) {
        trackSettingsState(settings)
        showTutorial()
    }

    if (process.platform === 'win32') {
        app.setAppUserModelId('BlinkBLink')
    }
    if (process.platform === 'darwin' && app.dock) {
        app.dock.hide()
        const appIcon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'))
        app.dock.setIcon(appIcon)
        app.setActivationPolicy('accessory')
    }
    createTray()
    startWorkTimer()
    updateTooltip()
    startAutoUpdateTimer()

    // Handle system resume events
    powerMonitor.on('resume', () => {
        startWorkTimer()
        updateTooltip()
        closeAllWindows()
    })

    powerMonitor.on('unlock-screen', () => {
        startWorkTimer()
        updateTooltip()
        closeAllWindows()
    })
})

app.on('window-all-closed', () => {
    // Keep the app running in the tray
})
destroyTray()

// Gracefully handle app quitting
app.on('before-quit', () => {
    trackEvent('app_quit')
    stopAutoUpdateTimer()
    clearTimer()
    closeAllWindows()
    destroyTray()
})
