// src/windows.ts

import { BrowserWindow, screen, ipcMain, nativeTheme } from 'electron' // Import nativeTheme
import * as path from 'path'
import { DURATIONS } from './constants'
import { store } from './store'

interface WindowWithInterval {
    window: BrowserWindow
    interval: NodeJS.Timeout
}

interface WindowConfig {
    type: 'overlay' | 'dashboard'
    display: Electron.Display
    duration: number
    autoDismiss: boolean
    onComplete: () => void
}

class WindowManager {
    private overlayWindows: BrowserWindow[] = []
    private overlayIntervals: WindowWithInterval[] = []
    private dashboardWindows: BrowserWindow[] = []
    private dashboardIntervals: WindowWithInterval[] = []

    private createWindow(config: WindowConfig): BrowserWindow {
        const { type, display } = config
        const window = new BrowserWindow({
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height,
            closable: false, // prevent command+w/alt+f4 from closing the window
            show: false, // Hide the window until ready
            transparent: process.platform === 'darwin',
            frame: false,
            skipTaskbar: true,
            titleBarStyle: 'hidden',
            hasShadow: false,
            enableLargerThanScreen: true,
            visualEffectState: 'active',
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
            vibrancy: 'fullscreen-ui', // MacOS specific
            backgroundMaterial: 'acrylic', // Windows specific
        })

        const htmlFile = `${type}.html`
        window.loadFile(path.join(__dirname, htmlFile))
        window.setAlwaysOnTop(true, 'screen-saver')
        if (process.platform === 'darwin') {
            window.setWindowButtonVisibility(false)
            window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
            window.setPosition(display.bounds.x, display.bounds.y)
            window.setSize(display.bounds.width, display.bounds.height)
        }

        window.once('ready-to-show', () => {
            window.show()
            if (config.type === 'dashboard') {
                this.closeOverlayWindows()
            }
            // window.setFocusable(false)
            this.startCountdown(window, type, config)
        })

        this.setupWindowEvents(window, type, config)
        return window
    }

    private setupWindowEvents(window: BrowserWindow, type: string, config: WindowConfig) {
        // Prevent default close behavior
        window.on('close', (event) => {
            // Only allow closing if we explicitly set a flag
            if (!window.closable) {
                event.preventDefault()
            }
        })

        window.on('closed', () => {
            this.cleanupWindow(window, type)
        })
    }

    private startCountdown(window: BrowserWindow, type: string, config: WindowConfig) {
        const windows = type === 'overlay' ? this.overlayWindows : this.dashboardWindows
        const intervals = type === 'overlay' ? this.overlayIntervals : this.dashboardIntervals

        windows.push(window)

        if (!config.autoDismiss) return

        let countdown = Math.floor(config.duration / 1000)
        window.webContents.send('start-countdown', config.duration)

        this.updateCountdown(type, countdown)
        const interval = setInterval(() => {
            if (window.isDestroyed()) {
                clearInterval(interval)
                return
            }

            countdown--
            if (countdown <= 0) {
                clearInterval(interval)
                this.handleCountdownComplete(type, config.onComplete)
                return
            }
            this.updateCountdown(type, countdown)
        }, 1000)
        intervals.push({ window, interval })
    }

    private updateCountdown(type: string, countdown: number) {
        const windows = type === 'overlay' ? this.overlayWindows : this.dashboardWindows
        windows.forEach((win) => {
            if (!win.isDestroyed()) {
                win.webContents.send('countdown-update', countdown)
            }
        })
    }

    private handleCountdownComplete(type: string, onComplete: () => void) {
        const intervals = type === 'overlay' ? this.overlayIntervals : this.dashboardIntervals
        intervals.forEach(({ interval }) => clearInterval(interval))
        onComplete()
    }

    private cleanupWindow(window: BrowserWindow, type: string) {
        const intervals = type === 'overlay' ? this.overlayIntervals : this.dashboardIntervals
        const windows = type === 'overlay' ? this.overlayWindows : this.dashboardWindows

        const intervalObj = intervals.find((i) => i.window === window)
        if (intervalObj) {
            clearInterval(intervalObj.interval)
            intervals.splice(intervals.indexOf(intervalObj), 1)
        }

        windows.splice(windows.indexOf(window), 1)
    }

    private closeWindow(window: BrowserWindow) {
        // Set closable flag to true before closing
        window.closable = true
        window.close()
    }

    showOverlay() {
        const displays = screen.getAllDisplays()
        displays.forEach((display) => {
            this.createWindow({
                type: 'overlay',
                display,
                duration: DURATIONS.BREAK_DURATION,
                autoDismiss: true,
                onComplete: () => ipcMain.emit('break-complete'),
            })
        })
    }

    showDashboard() {
        const displays = screen.getAllDisplays()
        const settings = store.get('settings')
        const duration = settings?.enableAutoDismiss ? settings.dashboardDuration : Infinity
        const autoDismiss = settings?.enableAutoDismiss || false

        displays.forEach((display) => {
            this.createWindow({
                type: 'dashboard',
                display,
                duration,
                autoDismiss,
                onComplete: () => ipcMain.emit('dashboard-dismissed'),
            })
        })
    }

    closeOverlayWindows() {
        this.overlayIntervals.forEach(({ interval }) => clearInterval(interval))
        this.overlayIntervals = []
        this.overlayWindows.forEach((win) => {
            if (!win.isDestroyed()) {
                this.closeWindow(win)
            }
        })
        this.overlayWindows = []
    }

    closeDashboardWindows() {
        this.dashboardIntervals.forEach(({ interval }) => clearInterval(interval))
        this.dashboardIntervals = []
        this.dashboardWindows.forEach((win) => {
            if (!win.isDestroyed()) {
                win.webContents.send('close-dashboard')
                this.closeWindow(win)
            }
        })
        this.dashboardWindows = []
    }
}

// Create singleton instance
const windowManager = new WindowManager()

// Set the theme source to system
nativeTheme.themeSource = 'system'

// Export methods
export const showOverlay = () => windowManager.showOverlay()
export const closeOverlayWindows = () => windowManager.closeOverlayWindows()
export const showDashboard = () => windowManager.showDashboard()
export const closeDashboardWindows = () => windowManager.closeDashboardWindows()
