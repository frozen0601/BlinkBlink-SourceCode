// src/windows.ts

import { BrowserWindow, screen, ipcMain } from 'electron'
import * as path from 'path'
import { DURATIONS } from './constants'

interface WindowWithInterval {
    window: BrowserWindow
    interval: NodeJS.Timeout
}

interface WindowConfig {
    type: 'overlay' | 'dashboard'
    display: Electron.Display
    countdownDuration: number
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
            transparent: true,
            frame: false,
            skipTaskbar: true,
            alwaysOnTop: true,
            opacity: 0.85,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
            // vibrancy: 'fullscreen-ui', // on MacOS
            // backgroundMaterial: 'acrylic', // on Windows
        })

        const htmlFile = `${type}.html`
        window.loadFile(path.join(__dirname, htmlFile))
        window.setAlwaysOnTop(true, 'floating')
        window.maximize()

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

        window.once('ready-to-show', () => {
            this.startCountdown(window, type, config)
        })
    }

    private startCountdown(window: BrowserWindow, type: string, config: WindowConfig) {
        let countdown = Math.floor(config.countdownDuration / 1000)

        // Add window to collection
        const windows = type === 'overlay' ? this.overlayWindows : this.dashboardWindows
        const intervals = type === 'overlay' ? this.overlayIntervals : this.dashboardIntervals
        windows.push(window)

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
                countdownDuration: DURATIONS.BREAK_DURATION,
                onComplete: () => ipcMain.emit('break-complete'),
            })
        })
    }

    showDashboard() {
        const displays = screen.getAllDisplays()
        displays.forEach((display) => {
            this.createWindow({
                type: 'dashboard',
                display,
                countdownDuration: DURATIONS.DASHBOARD_DURATION,
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
                win.close()
            }
        })
        this.dashboardWindows = []
    }
}

// Create singleton instance
const windowManager = new WindowManager()

// Export methods
export const showOverlay = () => windowManager.showOverlay()
export const closeOverlayWindows = () => windowManager.closeOverlayWindows()
export const showDashboard = () => windowManager.showDashboard()
export const closeDashboardWindow = () => windowManager.closeDashboardWindows()
