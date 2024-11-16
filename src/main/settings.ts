import settings from 'electron-settings'
import { BrowserWindow } from 'electron'

// Tray window position state
interface TrayWindowState {
    x?: number
    y?: number
}

export function getWindowPosition(windowName: string): TrayWindowState {
    return (settings.getSync(`${windowName}Position`) as TrayWindowState) || {}
}

export function saveWindowPosition(window: BrowserWindow, windowName: string) {
    if (!window.isDestroyed()) {
        const { x, y } = window.getBounds()
        settings.setSync(`${windowName}Position`, { x, y })
    }
}
