/**
 * Menu-bar / system-tray presence.
 *
 * On Linux this depends on the desktop providing a StatusNotifier host (GNOME
 * needs the AppIndicator extension). When the tray cannot be created the app
 * says so rather than starting up invisible with no way to reach its settings.
 */

import { app, BrowserWindow, Menu, MenuItemConstructorOptions, nativeImage, nativeTheme, screen, shell, Tray } from 'electron'
import { autoUpdater } from 'electron-updater'
import * as path from 'path'
import { getRemainingTimeInMinutes, getTimerStatus, isSkipping, resumeBreaks, skipBreaksFor, skipBreaksUntilEndOfDay } from './timer'
import { getWindowPosition, saveWindowPosition } from './store'
import { isLinux, isMac } from './platform'
import { appEvents } from './events'
import { showBreakView } from './windows'
import { formatRemainingTime } from '../core/format'

const TOOLTIP_REFRESH_MS = 30_000

const DONATION_LINKS = [
    { label: 'Buy Me a Coffee', url: 'https://2ly.link/216p3' },
    { label: 'Ko-fi', url: 'https://2ly.link/216p4' },
    { label: 'PayPal', url: 'https://2ly.link/216p8' },
] as const

const SUPPORT_EMAIL = 'theblinkblinkapp@gmail.com'

let statsWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let aboutWindow: BrowserWindow | null = null
let tray: Tray | null = null
let tooltipUpdateInterval: NodeJS.Timeout | null = null
let updateReady = false

// Utility windows -------------------------------------------------------

function createWindow(
    options: Electron.BrowserWindowConstructorOptions,
    fileName: string,
    onClose: () => void,
    windowName: string
): BrowserWindow {
    const position = getWindowPosition(windowName)

    const window = new BrowserWindow({
        ...options,
        x: position.x,
        y: position.y,
        show: false,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#f5f5f5',
        icon: getWindowIconPath(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            ...(isMac && { scrollBounce: true }),
        },
    })

    window.on('moved', () => saveWindowPosition(window, windowName))
    window.on('close', () => saveWindowPosition(window, windowName))
    window.on('closed', onClose)
    window.once('ready-to-show', () => window.show())

    window.loadFile(path.join(__dirname, fileName))

    return window
}

export function createStatsWindow(): void {
    if (statsWindow && !statsWindow.isDestroyed()) {
        statsWindow.focus()
        return
    }

    statsWindow = createWindow(
        { width: 600, height: 660, resizable: false, autoHideMenuBar: true },
        'stats.html',
        () => (statsWindow = null),
        'stats'
    )
}

export function createSettingsWindow(): void {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.focus()
        return
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    settingsWindow = createWindow(
        {
            width: Math.min(820, Math.round(width * 0.8)),
            // Height was previously derived from the screen *width*, which made
            // the window comically tall on ultrawide monitors.
            height: Math.min(860, Math.round(height * 0.85)),
            minWidth: 520,
            minHeight: 480,
            resizable: true,
            autoHideMenuBar: true,
        },
        'settings.html',
        () => (settingsWindow = null),
        'settings'
    )
}

export function createAboutWindow(): void {
    if (aboutWindow && !aboutWindow.isDestroyed()) {
        aboutWindow.focus()
        return
    }

    aboutWindow = createWindow(
        { width: 420, height: 840, resizable: false, autoHideMenuBar: true },
        'about.html',
        () => (aboutWindow = null),
        'about'
    )
}

// Tray ------------------------------------------------------------------

function getWindowIconPath(): string {
    return path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

/**
 * Builds the tray image at the size each platform expects.
 *
 * macOS wants a 16pt template image so the icon inverts with the menu bar;
 * Windows wants 16px; Linux indicator hosts scale for themselves.
 */
function createTrayImage(): Electron.NativeImage | null {
    const image = nativeImage.createFromPath(path.join(__dirname, 'icon.png'))
    if (image.isEmpty()) {
        console.error('[tray] could not load the tray icon from', path.join(__dirname, 'icon.png'))
        return null
    }

    if (isMac) {
        const resized = image.resize({ width: 16, height: 16 })
        resized.setTemplateImage(true)
        return resized
    }

    if (process.platform === 'win32') return image.resize({ width: 16, height: 16 })

    return image
}

function skipBreaksSubmenu(): MenuItemConstructorOptions[] {
    const durations = [30, 60, 120, 180]
    const items: MenuItemConstructorOptions[] = durations.map((minutes) => ({
        label: minutes >= 60 ? `${minutes / 60} hour${minutes > 60 ? 's' : ''}` : `${minutes} minutes`,
        click: () => skipBreaksFor(minutes),
    }))

    items.push({ label: 'Rest of the day', click: () => skipBreaksUntilEndOfDay() })
    return items
}

function donateSubmenu(): MenuItemConstructorOptions[] {
    return DONATION_LINKS.map(({ label, url }) => ({ label, click: () => void shell.openExternal(url) }))
}

function statusLabel(): string {
    const status = getTimerStatus()

    switch (status.mode) {
        case 'break':
            return `Next break in ${formatRemainingTime(getRemainingTimeInMinutes())}`
        case 'wait':
            return status.resumesAt
                ? `Paused until ${status.resumesAt.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`
                : 'Paused'
        default:
            return 'No breaks scheduled'
    }
}

function buildMenu(): Menu {
    const template: MenuItemConstructorOptions[] = [
        { label: statusLabel(), enabled: false },
        { type: 'separator' },
        { label: 'Take a break now', click: () => showBreakView() },
        { label: 'Skip breaks for', submenu: skipBreaksSubmenu() },
    ]

    if (isSkipping()) {
        template.push({ label: 'Resume breaks', click: () => resumeBreaks() })
    }

    template.push(
        { type: 'separator' },
        { label: 'Statistics', click: createStatsWindow },
        { label: 'Settings', click: createSettingsWindow },
        { label: 'About', click: createAboutWindow },
        { type: 'separator' },
        { label: 'Feedback', click: () => void shell.openExternal(`mailto:${SUPPORT_EMAIL}`) },
        { label: 'Donate', submenu: donateSubmenu() }
    )

    if (updateReady) {
        template.push({ type: 'separator' }, { label: 'Restart and Install Update', click: () => autoUpdater.quitAndInstall() })
    }

    template.push({ type: 'separator' }, { label: 'Quit BlinkBlink', click: () => app.quit() })

    return Menu.buildFromTemplate(template)
}

/**
 * Refreshes the tray title, tooltip and menu.
 *
 * `setTitle` is macOS only and `setToolTip` does nothing on most Linux
 * indicator hosts, so on Linux the countdown lives in the menu's first row —
 * which is why the menu is rebuilt rather than only the tooltip updated.
 */
export function updateTooltip(): void {
    if (!tray) return

    const status = getTimerStatus()
    const remaining = getRemainingTimeInMinutes()
    const title = status.mode === 'break' && remaining > 0 ? formatRemainingTime(remaining) : 'Zzz'

    if (isMac) tray.setTitle(title)
    tray.setToolTip(`BlinkBlink — ${statusLabel()}`)
    tray.setContextMenu(buildMenu())
}

export function createTray(): boolean {
    const image = createTrayImage()
    if (!image) return false

    try {
        tray = new Tray(image)
    } catch (error) {
        console.error('[tray] could not create the tray icon:', error)
        return false
    }

    tray.setToolTip('BlinkBlink')
    tray.setContextMenu(buildMenu())

    // Left-clicking an indicator does not open the menu on Linux, so give the
    // click something useful to do on the platforms where it is delivered.
    if (!isLinux) {
        tray.on('click', () => tray?.popUpContextMenu())
    }

    updateTooltip()
    tooltipUpdateInterval = setInterval(updateTooltip, TOOLTIP_REFRESH_MS)
    tooltipUpdateInterval.unref?.()

    autoUpdater.on('update-downloaded', () => {
        updateReady = true
        updateTooltip()
    })

    appEvents.on('timer-changed', () => updateTooltip())

    return true
}

export function destroyTray(): void {
    if (tooltipUpdateInterval) {
        clearInterval(tooltipUpdateInterval)
        tooltipUpdateInterval = null
    }
    if (tray) {
        tray.destroy()
        tray = null
    }
}

export function hasTray(): boolean {
    return tray !== null
}
