import { app, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getSettings, updateSettings, getStats } from './store'
import { Settings } from './types'
import { isRunning } from './timer'
import { showBreakView } from './windows'
import { checkForUpdates, startAutoUpdateTimer, stopAutoUpdateTimer } from './updater'
import { getAvailableSounds, getSoundPath } from './sound'
import { handleBreakComplete, handleBreakSkip, handleSummaryDismissed, handleScheduleUpdated } from './controller'

export function registerIpcHandlers() {
    // Simplified IPC handlers
    ipcMain.on('start-break-countdown', () => {
        if (isRunning()) {
            showBreakView()
        }
    })

    ipcMain.on('break-skip', () => {
        handleBreakSkip()
    })

    ipcMain.on('break-complete', () => {
        handleBreakComplete()
    })

    ipcMain.on('summary-dismissed', () => {
        handleSummaryDismissed()
    })

    ipcMain.on('schedule-updated', () => {
        handleScheduleUpdated()
    })

    // Data access handlers
    ipcMain.handle('get-stats', () => getStats())
    ipcMain.handle('get-settings', () => getSettings())
    ipcMain.handle('get-sound-path', (event, filename) => getSoundPath(filename))

    // IPC Handler - get app info from package.json
    ipcMain.handle('get-app-info', () => {
        const packageJsonPath = path.join(__dirname, '..', '..', 'package.json') // adjusted path assuming src/main/ipcHandlers.ts -> dist/main/ipcHandlers.js or similar
        const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'))
        return {
            version: packageJson.version,
            author: packageJson.author,
            description: packageJson.description,
            license: packageJson.license,
            website: packageJson.homepage,
            supportEmail: 'theblinkblinkapp@gmail.com',
        }
    })

    // IPC Handler - Check for updates (manual check)
    ipcMain.handle('check-for-updates', () => checkForUpdates(false))

    // Update the IPC handler to use imported function
    ipcMain.handle('get-available-sounds', () => getAvailableSounds())

    function trackSettingsState(settings: Settings) {
    }

    // IPC Handlers - Settings
    ipcMain.on('save-settings', (event, settings: Partial<Settings>) => {
        const currentSettings = getSettings()
        const autoUpdateChanged = currentSettings.autoUpdate !== settings.autoUpdate

        updateSettings(settings)
        trackSettingsState(getSettings())

        // Handle Auto Update side effect
        if (autoUpdateChanged) {
            if (settings.autoUpdate) {
                startAutoUpdateTimer()
            } else {
                stopAutoUpdateTimer()
            }
        }

        // Handle Schedule update side effect
        // We call these directly instead of emitting 'schedule-updated'
        handleScheduleUpdated()

        // Configure auto-start behavior
        app.setLoginItemSettings({
            openAtLogin: settings.startOnBoot,
            openAsHidden: true,
            path: app.getPath('exe'),
        })
    })
}
