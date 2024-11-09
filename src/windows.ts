// src/windows.ts

import { BrowserWindow, screen } from 'electron'
import { startWorkTimer } from './timer'
import * as path from 'path'

let overlayWindows: BrowserWindow[] = []
let dashboardWindow: BrowserWindow | null = null

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

        // Ensure the overlay stays on top even when blurred
        overlay.on('blur', () => {
            overlay.setAlwaysOnTop(true, 'floating')
            overlay.maximize()
        })

        // Remove reference when closed
        overlay.on('closed', () => {
            overlayWindows = overlayWindows.filter((win) => win !== overlay)
            overlay.destroy()
        })

        overlayWindows.push(overlay)
    })
}

export function closeOverlayWindows() {
    overlayWindows.forEach((win) => {
        if (!win.isDestroyed()) {
            win.close()
        }
    })
    overlayWindows = []
}

export function showDashboard() {
    if (dashboardWindow) {
        dashboardWindow.focus()
        return
    }

    dashboardWindow = new BrowserWindow({
        width: 400,
        height: 300,
        resizable: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    })

    dashboardWindow.loadFile(path.join(__dirname, 'dashboard.html'))

    dashboardWindow.on('closed', () => {
        dashboardWindow = null
    })

    // Automatically dismiss the dashboard after 5 seconds
    setTimeout(() => {
        closeDashboardWindow()
        startWorkTimer() // Start the next work timer
    }, 5 * 1000) // 5 seconds
}

export function closeDashboardWindow() {
    if (dashboardWindow) {
        dashboardWindow.close()
        dashboardWindow = null
    }
}
