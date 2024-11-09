// src/windows.ts

import { BrowserWindow, screen, ipcMain } from 'electron'
import * as path from 'path'

let overlayWindows: BrowserWindow[] = []
let overlayIntervals: { window: BrowserWindow; interval: NodeJS.Timeout }[] = []
let dashboardWindows: BrowserWindow[] = []
let dashboardIntervals: { window: BrowserWindow; interval: NodeJS.Timeout }[] = []

export function showOverlay() {
    const displays = screen.getAllDisplays()
    displays.forEach((display) => {
        const overlay = new BrowserWindow({
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
        })

        overlay.loadFile(path.join(__dirname, 'overlay.html'))
        overlay.setAlwaysOnTop(true, 'floating')
        overlay.maximize()

        overlay.on('blur', () => {
            if (!overlay.isDestroyed()) {
                overlay.setAlwaysOnTop(true, 'floating')
                overlay.maximize()
            }
        })

        overlay.on('closed', () => {
            // Clear interval associated with this window
            const intervalObj = overlayIntervals.find((i) => i.window === overlay)
            if (intervalObj) {
                clearInterval(intervalObj.interval)
                overlayIntervals = overlayIntervals.filter((i) => i.window !== overlay)
            }
            overlayWindows = overlayWindows.filter((win) => win !== overlay)
        })

        overlay.once('ready-to-show', () => {
            let countdown = 3
            const interval: NodeJS.Timeout = setInterval(() => {
                if (overlay.isDestroyed()) {
                    clearInterval(interval)
                    return
                }

                countdown -= 1
                if (!overlay.isDestroyed()) {
                    overlay.webContents.send('countdown-update', countdown)
                }

                if (countdown <= 0) {
                    clearInterval(interval)
                    overlayIntervals = overlayIntervals.filter((i) => i.interval !== interval)
                    ipcMain.emit('break-complete')
                }
            }, 1000)

            // Store interval with its associated window
            overlayIntervals.push({ window: overlay, interval })
        })

        overlayWindows.push(overlay)
    })
}

export function closeOverlayWindows() {
    // Clear all intervals
    overlayIntervals.forEach(({ interval }) => clearInterval(interval))
    overlayIntervals = []

    // Close all windows
    overlayWindows.forEach((win) => {
        if (!win.isDestroyed()) {
            win.close()
        }
    })
    overlayWindows = []
}

export function showDashboard() {
    const displays = screen.getAllDisplays()
    displays.forEach((display) => {
        const dashboard = new BrowserWindow({
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
        })

        dashboard.loadFile(path.join(__dirname, 'dashboard.html'))
        dashboard.setAlwaysOnTop(true, 'floating')
        dashboard.maximize()

        dashboard.on('blur', () => {
            if (!dashboard.isDestroyed()) {
                dashboard.setAlwaysOnTop(true, 'floating')
                dashboard.maximize()
            }
        })

        dashboard.on('closed', () => {
            const intervalObj = dashboardIntervals.find((i) => i.window === dashboard)
            if (intervalObj) {
                clearInterval(intervalObj.interval)
                dashboardIntervals = dashboardIntervals.filter((i) => i.window !== dashboard)
            }
            dashboardWindows = dashboardWindows.filter((win) => win !== dashboard)
        })

        dashboard.once('ready-to-show', () => {
            let countdown = 3
            const interval = setInterval(() => {
                if (dashboard.isDestroyed()) {
                    clearInterval(interval)
                    return
                }

                countdown -= 1
                dashboardWindows.forEach((win) => {
                    if (!win.isDestroyed()) {
                        win.webContents.send('countdown-update', countdown)
                    }
                })

                if (countdown <= 0) {
                    clearInterval(interval)
                    dashboardIntervals = dashboardIntervals.filter((i) => i.interval !== interval)
                    ipcMain.emit('dashboard-dismissed')
                }
            }, 1000)

            dashboardIntervals.push({ window: dashboard, interval })
        })

        dashboardWindows.push(dashboard)
    })
}

export function closeDashboardWindow() {
    // Clear all intervals
    dashboardIntervals.forEach(({ interval }) => clearInterval(interval))
    dashboardIntervals = []

    // Close all dashboard windows
    dashboardWindows.forEach((win) => {
        if (!win.isDestroyed()) {
            win.close()
        }
    })
    dashboardWindows = []
}
