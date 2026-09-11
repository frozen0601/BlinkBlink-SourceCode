/** The release note shown once after an update. */

import { app, BrowserWindow, screen } from 'electron'
import * as path from 'path'
import { noteToShow } from '../core/whatsNew'
import { getLastSeenVersion, setLastSeenVersion } from './store'
import { isMac } from './platform'

let noteWindow: BrowserWindow | null = null
let pendingLines: string[] = []

/**
 * Shows the note for this version, if there is one to show.
 *
 * The version is recorded as soon as the window opens rather than when it is
 * closed: a note that reappears every launch because someone quit the app from
 * the tray would be worse than no note at all.
 */
export function showWhatsNewIfNeeded(firstRun: boolean): void {
    const version = app.getVersion()
    const lines = noteToShow({ version, lastSeenVersion: getLastSeenVersion(), firstRun })
    if (!lines) {
        // Still record it, so someone who updates twice without seeing a note
        // is not shown an old one later.
        setLastSeenVersion(version)
        return
    }

    pendingLines = lines
    setLastSeenVersion(version)

    if (noteWindow && !noteWindow.isDestroyed()) {
        noteWindow.focus()
        return
    }

    const { workArea } = screen.getPrimaryDisplay()
    const width = 420
    const height = 312

    noteWindow = new BrowserWindow({
        width,
        height,
        x: workArea.x + Math.round((workArea.width - width) / 2),
        y: workArea.y + Math.round((workArea.height - height) / 3),
        frame: false,
        resizable: false,
        show: false,
        backgroundColor: '#101014',
        skipTaskbar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            ...(isMac && { scrollBounce: true }),
        },
    })

    noteWindow.loadFile(path.join(__dirname, 'whatsnew.html'))
    noteWindow.once('ready-to-show', () => noteWindow?.show())
    noteWindow.on('closed', () => {
        noteWindow = null
    })
}

/** What the note window renders. */
export function getWhatsNew(): { version: string; lines: string[] } {
    return { version: app.getVersion(), lines: pendingLines }
}

export function closeWhatsNew(): void {
    if (noteWindow && !noteWindow.isDestroyed()) noteWindow.close()
}
