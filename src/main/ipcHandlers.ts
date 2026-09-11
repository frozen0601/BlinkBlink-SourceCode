/**
 * IPC surface.
 *
 * Everything arriving from a renderer is treated as untrusted input: settings
 * go through `normalizeSettings`, sound names through the filename whitelist,
 * and external URLs through a scheme check before they reach `shell`.
 */

import { app, ipcMain, shell } from 'electron'
import { isAutostartSupported, setAutostart } from './autostart'
import { getSettings, getStats, getWorkDuration, setFirstRunCompleted, updateSettings } from './store'
import { getRemainingTimeInMinutes, getTimerStatus, skipBreaksFor, startWorkTimer } from './timer'
import { showBreakView } from './windows'
import { checkForUpdates, startAutoUpdateTimer, stopAutoUpdateTimer } from './updater'
import { getAvailableSounds, getSoundPath } from './sound'
import { handleBreakComplete, handleBreakSkip, handleScheduleUpdated, handleSummaryDismissed } from './controller'
import { closeReminder } from './reminder'
import { closeWhatsNew, getWhatsNew } from './whatsNew'
import { canShowNotificationActions, getBackdropMode, getUpdateDelivery, isLinux, isMac, isWindows } from './platform'
import { SETTINGS_LIMITS } from '../core/settings'

const SUPPORT_EMAIL = 'theblinkblinkapp@gmail.com'

/** Only ever hand the OS a web URL or a mail link. */
function isSafeExternalUrl(value: unknown): value is string {
    if (typeof value !== 'string' || value.length > 2048) return false
    try {
        const url = new URL(value)
        return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:'
    } catch {
        return false
    }
}

export function registerIpcHandlers(): void {
    // Break lifecycle ---------------------------------------------------

    ipcMain.on('break-skip', () => handleBreakSkip())
    ipcMain.on('break-complete', () => handleBreakComplete())
    ipcMain.on('summary-dismissed', () => handleSummaryDismissed())
    ipcMain.on('schedule-updated', () => handleScheduleUpdated())

    // Reminder toast ----------------------------------------------------

    ipcMain.on('reminder-skip', () => {
        closeReminder()
        skipBreaksFor(Math.max(1, Math.round(getWorkDuration() / 60_000)))
    })

    ipcMain.on('reminder-start-now', () => {
        closeReminder()
        showBreakView()
    })

    ipcMain.on('reminder-dismiss', () => closeReminder())

    // Tutorial ----------------------------------------------------------

    ipcMain.on('tutorial-finished', () => setFirstRunCompleted())

    // Release note ------------------------------------------------------

    ipcMain.handle('get-whats-new', () => getWhatsNew())
    ipcMain.on('whats-new-dismissed', () => closeWhatsNew())

    // Reads -------------------------------------------------------------

    ipcMain.handle('get-stats', () => getStats())
    ipcMain.handle('get-settings', () => getSettings())
    ipcMain.handle('get-available-sounds', () => getAvailableSounds())
    ipcMain.handle('get-sound-path', (_event, filename: unknown) => getSoundPath(filename))

    ipcMain.handle('get-app-info', () => ({
        // Read from Electron rather than re-reading package.json off disk: the
        // old relative path only happened to resolve inside the asar.
        version: app.getVersion(),
        name: app.getName(),
        description: 'Healthy Eyes, Happy Life',
        license: 'Source Available (see LICENSE)',
        website: 'https://blinkblinkapp.github.io/',
        supportEmail: SUPPORT_EMAIL,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
    }))

    /** Lets the settings window hide or explain options the platform cannot honour. */
    ipcMain.handle('get-capabilities', () => ({
        platform: process.platform,
        isMac,
        isWindows,
        isLinux,
        backdropMode: getBackdropMode(getSettings().overlayBackdrop),
        autostartSupported: isAutostartSupported(),
        notificationActionsSupported: canShowNotificationActions(),
        // snap, deb and rpm are refreshed by snap/apt/dnf, not by the app. An
        // AppImage is not, so the toggle is live there.
        autoUpdateManagedExternally: getUpdateDelivery() === 'external',
        limits: SETTINGS_LIMITS,
    }))

    ipcMain.handle('get-timer-status', () => {
        const status = getTimerStatus()
        return {
            mode: status.mode,
            remainingMinutes: getRemainingTimeInMinutes(),
            nextBreakAt: status.nextBreakAt?.getTime() ?? null,
            resumesAt: status.resumesAt?.getTime() ?? null,
        }
    })

    // Writes ------------------------------------------------------------

    ipcMain.handle('save-settings', (_event, incoming: unknown) => {
        const previous = getSettings()
        const saved = updateSettings(incoming)

        if (previous.autoUpdate !== saved.autoUpdate) {
            if (saved.autoUpdate) startAutoUpdateTimer()
            else stopAutoUpdateTimer()
        }

        if (previous.startOnBoot !== saved.startOnBoot) {
            const result = setAutostart(saved.startOnBoot)
            if (!result.ok) console.warn('[settings] could not change the startup setting:', result.reason)
        }

        // Durations and the schedule both feed the timer, so re-plan on any save.
        startWorkTimer()

        return saved
    })

    ipcMain.handle('check-for-updates', () => checkForUpdates(false))

    ipcMain.handle('open-external', async (_event, url: unknown) => {
        if (!isSafeExternalUrl(url)) {
            console.warn('[ipc] refused to open an external URL with an unsupported scheme')
            return false
        }
        await shell.openExternal(url)
        return true
    })
}
