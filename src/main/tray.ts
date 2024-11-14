// src/main/tray.ts
import { BrowserWindow, screen, Tray, Menu, nativeTheme, app, MenuItem } from 'electron'
import { autoUpdater } from 'electron-updater'
import { store } from './store'
import path from 'path'
import { skipBreaksFor, skipBreaksUntilEndOfDay } from './timer'

let statsWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let aboutWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(options: Electron.BrowserWindowConstructorOptions, filePath: string, onClose: () => void) {
    const window = new BrowserWindow({
        ...options,
        show: false,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#f5f5f5',
        icon: getIconPath(),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    })

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
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    const windowBounds = store.get('statsWindowBounds', { width, height, x: undefined, y: undefined })
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
        () => (statsWindow = null)
    )
}

export function createSettingsWindow() {
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
        () => (settingsWindow = null)
    )
}

export function createAboutWindow() {
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
        () => (aboutWindow = null)
    )
}

function createSkipBreaksSubmenu() {
    const durations = [5, 10, 30]
    return durations
        .map((duration) => ({
            label: `${duration} minutes`,
            click: () => skipBreaksFor(duration),
        }))
        .concat([
            {
                label: 'Rest of the day',
                click: () => skipBreaksUntilEndOfDay(),
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
