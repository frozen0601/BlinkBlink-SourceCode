import { BrowserWindow, Tray, Menu, nativeTheme, app, MenuItem } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import { skipBreaksFor, skipBreaksUntilEndOfDay, getRemainingTimeInMinutes, isSkippedUntilEndOfDay } from './timer'
import { getWindowPosition, saveWindowPosition } from './store'
import { TrayWindowPosition } from './types'

let statsWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let aboutWindow: BrowserWindow | null = null
let tray: Tray | null = null
let tooltipUpdateInterval: NodeJS.Timeout | null = null

function createWindow(options: Electron.BrowserWindowConstructorOptions, filePath: string, onClose: () => void, windowName: string) {
    const position = getWindowPosition(windowName)
    const window = new BrowserWindow({
        ...options,
        ...(position.x && position.y ? position : {}),
        show: false,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#f5f5f5',
        icon: getIconPath(),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    })

    if (windowName) {
        window.on('moved', () => saveWindowPosition(window, windowName))
        window.on('close', () => saveWindowPosition(window, windowName))
    }

    window.loadFile(path.join(__dirname, filePath))
    window.on('closed', onClose)
    window.once('ready-to-show', () => window.show())

    return window
}

export function createStatsWindow() {
    if (statsWindow) {
        statsWindow.focus()
        return
    }
    const position = getWindowPosition('stats')

    statsWindow = createWindow(
        {
            width: 600,
            height: 660,
            ...position,
            resizable: false,
            center: !position.x && !position.y,
            autoHideMenuBar: true,
        },
        'stats.html',
        () => (statsWindow = null),
        'stats'
    )
}

export function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus()
        return
    }
    const position = getWindowPosition('settings')

    settingsWindow = createWindow(
        {
            width: 400,
            height: 500,
            ...position,
            resizable: false,
            center: !position.x && !position.y,
            autoHideMenuBar: true,
        },
        'settings.html',
        () => (settingsWindow = null),
        'settings'
    )
}

export function createAboutWindow() {
    if (aboutWindow) {
        aboutWindow.focus()
        return
    }
    const position = getWindowPosition('about')

    aboutWindow = createWindow(
        {
            width: 420,
            height: 840,
            ...position,
            resizable: false,
            center: !position.x && !position.y,
            autoHideMenuBar: true,
        },
        'about.html',
        () => (aboutWindow = null),
        'about'
    )
}

function createSkipBreaksSubmenu() {
    const durations = [30, 60, 120, 180]
    return durations
        .map((duration) => ({
            label: duration >= 60 ? `${duration / 60} hr${duration > 60 ? 's' : ''}` : `${duration} mins`,
            click: () => {
                skipBreaksFor(duration)
                updateTooltip()
            },
        }))
        .concat([
            {
                label: 'Rest of the day',
                click: () => {
                    skipBreaksUntilEndOfDay()
                    updateTooltip()
                },
            },
        ])
}

function getIconPath() {
    return process.platform === 'win32'
        ? path.join(__dirname, 'icon.ico')
        : process.platform === 'darwin'
        ? path.join(__dirname, 'icon.icns')
        : path.join(__dirname, 'icon.png')
}

function formatDuration(mins: number): string {
    if (mins < 60) {
        return `${mins} min${mins !== 1 ? 's' : ''}`
    }

    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    const hourText = `${hours} hr${hours > 1 ? 's' : ''}`
    return remainingMins > 0 ? `${hourText} ${remainingMins} min` : hourText
}

export function updateTooltip() {
    if (!tray) return

    const mins = getRemainingTimeInMinutes()
    const isRestOfDay = isSkippedUntilEndOfDay()

    const timeText = isRestOfDay ? 'Zzz' : formatDuration(mins)
    const tooltipText = `BlinkBlink - ${isRestOfDay ? 'Rest of day' : timeText}`
    tray.setToolTip(tooltipText)

    if (process.platform === 'darwin') {
        tray.setTitle(timeText)
    }
}

export function createTray() {
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

    // Set up tooltip update interval
    updateTooltip()
    tooltipUpdateInterval = setInterval(updateTooltip, 30000) // Update every 30 seconds

    let contextMenu = Menu.buildFromTemplate([
        {
            label: 'Skip Breaks',
            submenu: createSkipBreaksSubmenu(),
        },
        { label: 'Statistics', click: createStatsWindow },
        { label: 'Settings', click: createSettingsWindow },
        { label: 'About', click: createAboutWindow },
        { label: 'Quit', click: () => app.quit() },
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

// Add cleanup function
export function destroyTray() {
    if (tooltipUpdateInterval) {
        clearInterval(tooltipUpdateInterval)
        tooltipUpdateInterval = null
    }
    if (tray) {
        tray.destroy()
        tray = null
    }
}
