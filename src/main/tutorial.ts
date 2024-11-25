import { BrowserWindow, screen } from 'electron'
import * as path from 'path'
import { setFirstRunCompleted } from './store'

let tutorialWindow: BrowserWindow | null = null

export function showTutorial() {
    if (tutorialWindow) return

    const display = screen.getPrimaryDisplay()
    const width = 1200
    const height = 800

    tutorialWindow = new BrowserWindow({
        width,
        height,
        x: Math.round((display.bounds.width - width) / 2),
        y: Math.round((display.bounds.height - height) / 2),
        frame: false,
        resizable: true,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            ...(process.platform === 'darwin' && { scrollBounce: true }),
        },
    })

    tutorialWindow.loadFile(path.join(__dirname, 'tutorial.html'))

    tutorialWindow.once('ready-to-show', () => {
        tutorialWindow?.show()
    })

    tutorialWindow.on('closed', () => {
        tutorialWindow = null
        setFirstRunCompleted()
    })
}

export function closeTutorial() {
    if (tutorialWindow && !tutorialWindow.isDestroyed()) {
        tutorialWindow.close()
    }
}
