import { app, BrowserWindow, Tray, Menu, ipcMain, screen, Notification } from 'electron'
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
import { initializeAutoUpdater } from './updater'
import { autoUpdater } from 'electron-updater'

let mainWindow: BrowserWindow | null = null
let statsWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let aboutWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isUpdateDownloaded: boolean = false

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

// Window Creation Methods
function createMainWindow() {
    const iconPath =
        process.platform === 'win32'
            ? path.join(__dirname, 'icon.ico')
            : process.platform === 'darwin'
            ? path.join(__dirname, 'icon.icns')
            : path.join(__dirname, 'icon.png')
    mainWindow = new BrowserWindow({
        show: false,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    })
    initializeAutoUpdater(mainWindow)
}

function createStatsWindow() {
    const iconPath =
        process.platform === 'win32'
            ? path.join(__dirname, 'icon.ico')
            : process.platform === 'darwin'
            ? path.join(__dirname, 'icon.icns')
            : path.join(__dirname, 'icon.png')
    if (statsWindow) {
        statsWindow.focus()
        return
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    statsWindow = new BrowserWindow({
        width: Math.min(800, width * 0.8),
        height: Math.min(600, height * 0.8),
        resizable: true,
        center: true,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        autoHideMenuBar: true,
        alwaysOnTop: true, // Ensure window is above overlays
    })
    statsWindow.loadFile(path.join(__dirname, 'stats.html'))

    statsWindow.on('closed', () => {
        statsWindow = null
    })
}

function createSettingsWindow() {
    const iconPath =
        process.platform === 'win32'
            ? path.join(__dirname, 'icon.ico')
            : process.platform === 'darwin'
            ? path.join(__dirname, 'icon.icns')
            : path.join(__dirname, 'icon.png')
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
        icon: iconPath,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        autoHideMenuBar: true,
        alwaysOnTop: true, // Ensure window is above overlays
    })
    settingsWindow.loadFile(path.join(__dirname, 'settings.html'))

    settingsWindow.on('closed', () => {
        settingsWindow = null
    })
}

function createAboutWindow() {
    const iconPath =
        process.platform === 'win32'
            ? path.join(__dirname, 'icon.ico')
            : process.platform === 'darwin'
            ? path.join(__dirname, 'icon.icns')
            : path.join(__dirname, 'icon.png')
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
        icon: iconPath,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        autoHideMenuBar: true,
        alwaysOnTop: true, // Ensure window is above overlays
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
                { 
                    label: '5 minutes', 
                    click: () => { 
                        skipBreaks(5)
                        closeOverlayWindows()
                        closeDashboardWindows()
                        updateBreakStats(true)
                    } 
                },
                { 
                    label: '10 minutes', 
                    click: () => { 
                        skipBreaks(10)
                        closeOverlayWindows()
                        closeDashboardWindows()
                        updateBreakStats(true)
                    } 
                },
                { 
                    label: '30 minutes', 
                    click: () => { 
                        skipBreaks(30)
                        closeOverlayWindows()
                        closeDashboardWindows()
                        updateBreakStats(true)
                    } 
                },
                { 
                    label: 'Rest of the day', 
                    click: () => { 
                        skipBreaksUntilEndOfDay()
                        closeOverlayWindows()
                        closeDashboardWindows()
                        updateBreakStats(true)
                    } 
                },
            ],
        },
        { label: 'View Stats', click: createStatsWindow },
        { label: 'Settings', click: createSettingsWindow },
        { label: 'About', click: createAboutWindow },
        {
            label: 'Check for updates',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('check-for-updates')
                }
            },
        },
        { label: 'Exit', click: () => app.quit() },
    ])
    tray.setToolTip('BlinkBlink')
    tray.setContextMenu(contextMenu)
    autoUpdater.on('update-available', () => {
        if (tray) {
            tray.setToolTip('BlinkBlink - Update Available')
        }
    })

    autoUpdater.on('update-downloaded', () => {
        if (tray) {
            tray.setToolTip('BlinkBlink - Update Ready to Install')
        }
    })

    // Listen for update-downloaded event from updater.ts
    ipcMain.on('update-downloaded', () => {
        isUpdateDownloaded = true
        // Update tray menu to show 'Restart to apply updates'
        if (tray) {
            const updatedMenu = Menu.buildFromTemplate([
                { label: 'Pause Timer', type: 'normal', click: pauseTimer },
                {
                    label: 'Skip Breaks',
                    submenu: [
                        { 
                            label: '5 minutes', 
                            click: () => { 
                                skipBreaks(5)
                                closeOverlayWindows()
                                closeDashboardWindows()
                                updateBreakStats(true)
                            } 
                        },
                        { 
                            label: '10 minutes', 
                            click: () => { 
                                skipBreaks(10)
                                closeOverlayWindows()
                                closeDashboardWindows()
                                updateBreakStats(true)
                            } 
                        },
                        { 
                            label: '30 minutes', 
                            click: () => { 
                                skipBreaks(30)
                                closeOverlayWindows()
                                closeDashboardWindows()
                                updateBreakStats(true)
                            } 
                        },
                        { 
                            label: 'Rest of the day', 
                            click: () => { 
                                skipBreaksUntilEndOfDay()
                                closeOverlayWindows()
                                closeDashboardWindows()
                                updateBreakStats(true)
                            } 
                        },
                    ],
                },
                { label: 'View Stats', click: createStatsWindow },
                { label: 'Settings', click: createSettingsWindow },
                { label: 'About', click: createAboutWindow },
                {
                    label: 'Restart to apply updates',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('restart-and-install')
                        }
                    },
                },
                { label: 'Exit', click: () => app.quit() },
            ])
            tray.setContextMenu(updatedMenu)

            // Notify user that update is ready
            new Notification({
                title: 'Update Ready',
                body: 'A new update has been downloaded. Restart the application to apply the updates.',
            }).show()
        }
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
        supportEmail: 'theblinkblinkapp@gmail.com',
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
    createMainWindow()
    createTray()
    startWorkTimer()

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
    if (mainWindow) mainWindow.close()
})
