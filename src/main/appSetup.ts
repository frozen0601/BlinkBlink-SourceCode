import { app, nativeImage, powerMonitor } from 'electron'
import * as path from 'path'
import { getSettings, hasCompletedFirstRun } from './store'
import { startWorkTimer } from './timer'
import { createTray, updateTooltip } from './tray'
import { startAutoUpdateTimer } from './updater'
import { showTutorial } from './tutorial'
import { closeAllWindows } from './windows'
import { Settings } from './types'

function trackSettingsState(settings: Settings) {
}

export function setupApp() {
    const firstRun = !hasCompletedFirstRun()

    const settings = getSettings()
    if (firstRun) {
        trackSettingsState(settings)
        showTutorial()
    }

    if (process.platform === 'win32') {
        app.setAppUserModelId('BlinkBLink')
    }
    if (process.platform === 'darwin' && app.dock) {
        app.dock.hide()
        const appIcon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'))
        app.dock.setIcon(appIcon)
        app.setActivationPolicy('accessory')
    }
    createTray()
    startWorkTimer()
    updateTooltip()
    startAutoUpdateTimer()

    // Handle system resume events
    powerMonitor.on('resume', () => {
        startWorkTimer()
        updateTooltip()
        closeAllWindows()
    })

    powerMonitor.on('unlock-screen', () => {
        startWorkTimer()
        updateTooltip()
        closeAllWindows()
    })
}
