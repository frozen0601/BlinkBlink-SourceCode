/** The first-run walkthrough. */

import { BrowserWindow, screen } from 'electron'
import * as path from 'path'
import { isMac } from './platform'
import { setFirstRunCompleted } from './store'

let tutorialWindow: BrowserWindow | null = null

export function showTutorial(): void {
    if (tutorialWindow && !tutorialWindow.isDestroyed()) {
        tutorialWindow.focus()
        return
    }

    // Fit inside the work area rather than assuming a display at least
    // 1200x800 — the old fixed size ran off the bottom of smaller laptops and
    // positioned the window at a negative offset.
    const { workArea } = screen.getPrimaryDisplay()
    const width = Math.min(1200, Math.round(workArea.width * 0.9))
    const height = Math.min(800, Math.round(workArea.height * 0.9))

    tutorialWindow = new BrowserWindow({
        width,
        height,
        x: workArea.x + Math.round((workArea.width - width) / 2),
        y: workArea.y + Math.round((workArea.height - height) / 2),
        frame: false,
        resizable: true,
        show: false,
        backgroundColor: '#101014',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            ...(isMac && { scrollBounce: true }),
        },
    })

    tutorialWindow.loadFile(path.join(__dirname, 'tutorial.html'))
    tutorialWindow.once('ready-to-show', () => tutorialWindow?.show())

    tutorialWindow.on('closed', () => {
        tutorialWindow = null
        // Recorded on close as well as on "Finish" so a user who dismisses the
        // walkthrough is not shown it again on every launch.
        setFirstRunCompleted()
    })
}

export function closeTutorial(): void {
    if (tutorialWindow && !tutorialWindow.isDestroyed()) tutorialWindow.close()
}
