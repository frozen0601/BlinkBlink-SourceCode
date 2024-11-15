import { app, BrowserWindow, ipcMain, screen, nativeTheme } from 'electron'
import * as path from 'path'
import { store } from './store'
import { Settings } from './storeTypes'
import * as fs from 'fs'
import { startWorkTimer, clearTimer, isRunning } from './timer'
import { showBreakView, showSummaryView, closeAllWindows } from './windows'
import { DURATIONS } from './constants'
import { autoUpdater } from 'electron-updater'
import { createTray } from './tray'

// Stats Management
export function updateBreakStats(skipped: boolean) {
    const stats = store.get('stats')
    const currentTime = Date.now()

    if (skipped) {
        // Reset current streak but preserve highest
        store.set('stats', {
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

        store.set('stats', updatedStats)
    }
    store.set('lastBreakEndTime', currentTime)
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

// Simplified IPC handlers - Single source of truth
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

// Data access handlers
ipcMain.handle('get-stats', () => store.get('stats'))
ipcMain.handle('get-settings', () => store.get('settings'))
ipcMain.handle('get-summary-duration', () => store.get('settings')?.summaryDuration)

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

// IPC Handler - Check for updates
ipcMain.handle('check-for-updates', async () => {
    if (process.env.NODE_ENV === 'development') {
        console.log('Simulating update check in development mode.')
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                console.log('Simulated update check complete.')
                resolve()
            }, 2000)
        })
    } else {
        return autoUpdater.checkForUpdatesAndNotify()
    }
})

// IPC Handlers - Settings
ipcMain.on('save-settings', (event, settings: Settings) => {
    store.set('settings', settings)
    // Configure auto-start behavior
    app.setLoginItemSettings({
        openAtLogin: settings.startOnBoot,
        // For Windows, this ensures the app starts minimized in tray
        openAsHidden: true,
        // Required for macOS to work properly
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

    // Automatically check for updates on startup
    autoUpdater.checkForUpdatesAndNotify()

    // Initialize auto-start setting based on stored preference
    const settings = store.get('settings')
    app.setLoginItemSettings({
        openAtLogin: settings?.startOnBoot || false,
        openAsHidden: true,
        path: app.getPath('exe'),
    })
})

app.on('window-all-closed', () => {
    // Keep the app running in the tray
})

// Gracefully handle app quitting
app.on('before-quit', () => {
    clearTimer()
    closeAllWindows()
})
