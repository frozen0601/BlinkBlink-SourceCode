// src/windows.ts

import { BrowserWindow, screen, ipcMain, nativeTheme } from 'electron'
import * as path from 'path'
import { DURATIONS } from './constants'
import { getSettings } from './store'
import { trackEvent } from '@aptabase/electron/main'

interface WindowWithInterval {
    window: BrowserWindow
    interval: NodeJS.Timeout
}

interface WindowConfig {
    type: 'break' | 'summary'
    display: Electron.Display
    duration: number
    autoDismiss: boolean
    onComplete: () => void
}

class WindowManager {
    constructor() {}

    private windowsByDisplay = new Map<number, BrowserWindow>()
    private activeIntervals: WindowWithInterval[] = []

    private createOrUpdateWindow(config: WindowConfig): BrowserWindow {
        const { type, display } = config
        let window = this.windowsByDisplay.get(display.id)
        let isNewWindow = false

        if (!window) {
            isNewWindow = true
            window = new BrowserWindow({
                x: display.bounds.x,
                y: display.bounds.y,
                width: display.bounds.width,
                height: display.bounds.height,
                closable: false,
                // focusable: false,
                show: false,
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
                vibrancy: 'fullscreen-ui',
                backgroundMaterial: 'acrylic',
            })

            window.loadFile(path.join(__dirname, 'overlay.html'))
            window.setAlwaysOnTop(true, 'screen-saver')

            if (process.platform === 'darwin') {
                window.setWindowButtonVisibility(false)
                window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
            }
            window.setPosition(display.bounds.x, display.bounds.y)
            window.setSize(display.bounds.width, display.bounds.height)
            this.setupWindowEvents(window, display.id)
            this.windowsByDisplay.set(display.id, window)
        }

        if (isNewWindow) {
            // For new windows, wait for ready-to-show
            window.once('ready-to-show', () => {
                window.webContents.send('show-view', type)
                window.show()
                window.setFocusable(false)
                this.startCountdown(window, type, config)
            })
        } else {
            window.webContents.send('show-view', type)
            this.startCountdown(window, type, config)
        }

        return window
    }

    private setupWindowEvents(window: BrowserWindow, displayId: number) {
        window.on('close', (event) => {
            if (!window.closable) {
                event.preventDefault()
            }
        })

        window.on('closed', () => {
            this.windowsByDisplay.delete(displayId)
            this.cleanupWindow(window)
        })
    }

    private startCountdown(window: BrowserWindow, type: string, config: WindowConfig) {
        const intervals = this.activeIntervals

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
        for (const window of this.windowsByDisplay.values()) {
            if (!window.isDestroyed()) {
                window.webContents.send('countdown-update', countdown)
            }
        }
    }

    private handleCountdownComplete(type: string, onComplete: () => void) {
        const intervals = this.activeIntervals
        intervals.forEach(({ interval }) => clearInterval(interval))
        onComplete()
    }

    private cleanupWindow(window: BrowserWindow) {
        const intervalObj = this.activeIntervals.find((i) => i.window === window)
        if (intervalObj) {
            clearInterval(intervalObj.interval)
            this.activeIntervals = this.activeIntervals.filter((i) => i !== intervalObj)
        }
    }

    showBreakView() {
        trackEvent('view_shown', { type: 'break' })
        const displays = screen.getAllDisplays()
        displays.forEach((display) => {
            this.createOrUpdateWindow({
                type: 'break',
                display,
                duration: DURATIONS.BREAK_DURATION,
                autoDismiss: true,
                onComplete: () => ipcMain.emit('break-complete'),
            })
        })
    }

    showSummaryView() {
        trackEvent('view_shown', { type: 'summary' })
        const displays = screen.getAllDisplays()
        const settings = getSettings()
        const duration = settings?.enableAutoDismiss ? settings.summaryDuration : Infinity
        const autoDismiss = settings?.enableAutoDismiss || false

        // Clear existing intervals before updating views
        this.activeIntervals.forEach(({ interval }) => clearInterval(interval))
        this.activeIntervals = []
        displays.forEach((display) => {
            this.createOrUpdateWindow({
                type: 'summary',
                display,
                duration,
                autoDismiss,
                onComplete: () => ipcMain.emit('summary-dismissed'),
            })
        })
    }

    closeAllWindows() {
        this.activeIntervals.forEach(({ interval }) => clearInterval(interval))
        this.activeIntervals = []

        for (const [displayId, window] of this.windowsByDisplay) {
            if (!window.isDestroyed()) {
                window.closable = true
                window.close()
            }
        }
        this.windowsByDisplay.clear()
    }
}

// Create singleton instance
const windowManager = new WindowManager()

// Set the theme source to system
nativeTheme.themeSource = 'system'

// Export methods
export const showBreakView = () => windowManager.showBreakView()
export const showSummaryView = () => windowManager.showSummaryView()
export const closeAllWindows = () => windowManager.closeAllWindows()
