import { app, BrowserWindow, Tray, Menu, MenuItem, ipcMain, screen, nativeTheme } from 'electron'
import * as path from 'path'
import Store from 'electron-store'
import { StoreSchema, Settings } from './storeTypes'
import * as fs from 'fs'
import {
    startWorkTimer,
    skipBreak,
    completeBreak,
    dismissDashboard,
    pauseTimer,
    skipBreaks,
    skipBreaksUntilEndOfDay,
    isRunning,
} from './timer'
import { showOverlay, closeOverlayWindows, showDashboard, closeDashboardWindows } from './windows'
import { DURATIONS } from './constants'
import { autoUpdater } from 'electron-updater'

let statsWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let aboutWindow: BrowserWindow | null = null
let tray: Tray | null = null

const store = new Store<StoreSchema>({
    defaults: {
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
    const currentTime = Date.now()
    if (stats.highestStreakCount === undefined) stats.highestStreakCount = 0
    if (stats.highestStreakDuration === undefined) stats.highestStreakDuration = 0
    if (stats.highestStreakStartTime === undefined) stats.highestStreakStartTime = Date.now()
    if (stats.highestStreakEndTime === undefined) stats.highestStreakEndTime = Date.now()

    if (skipped) {
        // Just reset current streak but preserve highest
        store.set('stats', {
            ...stats,
            breakStreakCount: 0,
            breakStreakDuration: 0,
            streakStartTime: currentTime,
        })
        store.set('lastBreakEndTime', currentTime)
    } else {
        // Completing a break successfully
        const newCount = stats.breakStreakCount + 1
        const newDuration = stats.breakStreakDuration + DURATIONS.BREAK_DURATION

        // Update current streak
        const updatedStats = {
            ...stats,
            breakStreakCount: newCount,
            breakStreakDuration: newDuration,
        }

        // Update highest streak
        if (newCount > stats.highestStreakCount) {
            updatedStats.highestStreakCount = newCount
            updatedStats.highestStreakDuration = newDuration
            updatedStats.highestStreakStartTime = stats.streakStartTime
            updatedStats.highestStreakEndTime = currentTime
        }

        store.set('stats', updatedStats)
        store.set('lastBreakEndTime', currentTime)
    }
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

    // Only show the window when content is ready
    window.once('ready-to-show', () => {
        window.show()
    })

    return window
}

function createStatsWindow() {
    if (statsWindow) {
        statsWindow.focus()
        return
    }
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    const windowBounds = store.get('statsWindowBounds', { width: width, height: height, x: undefined, y: undefined })
    statsWindow = createWindow(
        {
            width: Math.min(600, width * 0.8),
            height: Math.min(650, height * 0.8),
            x: windowBounds.x,
            y: windowBounds.y,
            resizable: true,
            center: windowBounds.x === undefined || windowBounds.y === undefined,
            autoHideMenuBar: true,
        },
        'stats.html',
        () => {
            statsWindow = null
        }
    )
}

function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus()
        return
    }
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    settingsWindow = createWindow(
        {
            width: Math.min(500, width * 0.5),
            height: Math.min(470, height * 0.5),
            resizable: true,
            center: true,
            autoHideMenuBar: true,
        },
        'settings.html',
        () => {
            settingsWindow = null
        }
    )
}

function createAboutWindow() {
    if (aboutWindow) {
        aboutWindow.focus()
        return
    }
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    aboutWindow = createWindow(
        {
            width: Math.min(430),
            height: Math.min(650),
            resizable: false,
            center: true,
            autoHideMenuBar: true,
        },
        'about.html',
        () => {
            aboutWindow = null
        }
    )
}

function createSkipBreaksSubmenu() {
    const durations = [5, 10, 30]
    return durations
        .map((duration) => ({
            label: `${duration} minutes`,
            click: () => {
                skipBreaks(duration)
                closeOverlayWindows()
                closeDashboardWindows()
                updateBreakStats(true)
            },
        }))
        .concat([
            {
                label: 'Rest of the day',
                click: () => {
                    skipBreaksUntilEndOfDay()
                    closeOverlayWindows()
                    closeDashboardWindows()
                    updateBreakStats(true)
                },
            },
        ])
}

function createTray() {
    const { nativeImage, Notification } = require('electron')
    let trayIcon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'))
    const iconSize = trayIcon.getSize()
    if (iconSize.width === 0 && iconSize.height === 0) {
        console.error('Failed to load tray icon:', getIconPath())
        return
    }
    if (process.platform === 'darwin') trayIcon = trayIcon.resize({ width: 16 })
    trayIcon.setTemplateImage(true)
    tray = new Tray(trayIcon)
    let contextMenu = Menu.buildFromTemplate([
        {
            label: 'Skip Breaks',
            submenu: createSkipBreaksSubmenu(),
        },
        { label: 'Statistics', click: createStatsWindow },
        { label: 'Settings', click: createSettingsWindow },
        { label: 'About', click: createAboutWindow },
        { label: 'Exit', click: () => app.quit() },
    ])
    tray.setToolTip('BlinkBlink')
    tray.setContextMenu(contextMenu)

    // If an update is available, show restart/exit and install
    autoUpdater.on('update-downloaded', () => {
        const updateItem = new MenuItem({ label: 'Restart and Install Update', click: () => autoUpdater.quitAndInstall() })
        const updatedMenu = contextMenu.items
            .slice(0, -1)
            .concat(updateItem, new MenuItem({ label: 'Exit and Install Update', click: () => app.quit() }))
        contextMenu = Menu.buildFromTemplate(updatedMenu)
        if (tray) tray.setContextMenu(contextMenu)
    })
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
    pauseTimer()
    closeOverlayWindows()
    closeDashboardWindows()
    if (statsWindow) statsWindow.close()
    if (settingsWindow) settingsWindow.close()
})
