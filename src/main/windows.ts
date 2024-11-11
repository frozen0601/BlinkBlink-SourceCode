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
            show: false, // Don't show until ready
            transparent: type === 'overlay' || type === 'dashboard',
            backgroundColor:
                type === 'overlay' || type === 'dashboard' ? undefined : nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#f5f5f5',
            frame: false,
            skipTaskbar: true,
            alwaysOnTop: true,
            titleBarStyle: 'hidden',
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
            // opacity: 0.85,
            // vibrancy: 'fullscreen-ui', // on MacOS
            // backgroundMaterial: 'acrylic', // on Windows
        })

        const htmlFile = `${type}.html`
        window.loadFile(path.join(__dirname, htmlFile))
        window.setAlwaysOnTop(true, 'floating')
        
        // Only show and maximize when content is ready
        window.once('ready-to-show', () => {
            window.show()
            window.maximize()
            this.startCountdown(window, type, config)
        })

        this.setupWindowEvents(window, type, config)
        return window
    }

    private setupWindowEvents(window: BrowserWindow, type: string, config: WindowConfig) {
        window.on('blur', () => {
            if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true, 'floating')
                window.maximize()
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
                win.close()
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
