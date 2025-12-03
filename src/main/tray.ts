import { BrowserWindow, Tray, Menu, nativeTheme, app, screen, MenuItem } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import { skipBreaksFor, skipBreaksUntilEndOfDay, getRemainingTimeInMinutes, isRunning } from './timer'
import { getWindowPosition, saveWindowPosition } from './store'
import { scheduleManager } from './scheduler'

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
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            ...(process.platform === 'darwin' && { scrollBounce: true }),
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
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    settingsWindow = createWindow(
        {
            width: Math.min(800, width * 0.8),
            height: Math.min(800, width * 0.8),
            ...position,
            resizable: true,
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
    switch (process.platform) {
        case 'win32':
            return path.join(__dirname, 'icon.ico')
        case 'darwin':
            return path.join(__dirname, 'icon.icns')
        default:
            return path.join(__dirname, 'icon.png')
    }
}

function formatRemainingTime(minutes: number): string {
    if (minutes < 60) {
        return `${minutes}m`
    }
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

export function updateTooltip() {
    if (!tray) return

    const now = new Date()
    const isActive = scheduleManager.isWithinActiveHours(now)
    const remainingMins = getRemainingTimeInMinutes()
    let outputText = 'Zzz'

    if (isActive && isRunning() && remainingMins > 0) {
        outputText = formatRemainingTime(remainingMins)
    }

    if (process.platform === 'darwin') tray.setTitle(outputText)
    tray.setToolTip(`BlinkBlink: ${outputText}`)
}

function createDonateSubmenu() {
    return [
        {
            label: 'Buy Me a Coffee',
            click: () => require('electron').shell.openExternal('https://2ly.link/216p3'),
        },
        {
            label: 'Ko-fi',
            click: () => require('electron').shell.openExternal('https://2ly.link/216p4'),
        },
        {
            label: 'PayPal',
            click: () => require('electron').shell.openExternal('https://2ly.link/216p8'),
        },
    ]
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
        { type: 'separator' },
        {
            label: 'Feedback',
            click: () => require('electron').shell.openExternal('mailto:theblinkblinkapp@gmail.com'),
        },
        {
            label: 'Donate',
            submenu: createDonateSubmenu(),
        },
        { type: 'separator' },
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
