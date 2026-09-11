/** Everything that has to happen once, after `app.whenReady()`. */

import { app, dialog, nativeImage, nativeTheme, powerMonitor } from 'electron'
import * as path from 'path'
import { syncAutostart } from './autostart'
import { registerController } from './controller'
import { isLinux, isMac, isWindows } from './platform'
import { closeReminder, registerReminder } from './reminder'
import { ensureUserId, getSettings, hasCompletedFirstRun } from './store'
import { reportAppStarted } from './analytics'
import { showWhatsNewIfNeeded } from './whatsNew'
import { startTimer, startWorkTimer, stopTimer } from './timer'
import { createTray, destroyTray, updateTooltip } from './tray'
import { showTutorial } from './tutorial'
import { startAutoUpdateTimer, stopAutoUpdateTimer } from './updater'
import { closeAllWindows } from './windows'

/**
 * Windows Application User Model ID.
 *
 * Windows will not deliver a toast unless this matches the AppUserModelID
 * stamped on the app's Start Menu shortcut, which electron-builder takes from
 * `build.appId`. It previously read 'BlinkBLink' against an `appId` of
 * 'blinkblink' — a mismatch, so Windows notifications were dropped on the
 * floor. Keep this string identical to `build.appId` in package.json.
 *
 * (A reverse-DNS id would be more conventional, but changing `appId` now would
 * orphan the NSIS uninstall entry and break in-place upgrades for existing
 * installs. See docs/ROADMAP.md.)
 */
/**
 * Must match `build.appId` in package.json. Windows drops toasts when they
 * disagree, and the macOS in-place installer refuses a bundle whose
 * CFBundleIdentifier is not this.
 */
export const APP_ID = 'blinkblink'
const APP_USER_MODEL_ID = APP_ID

function applyPlatformIdentity(): void {
    if (isWindows) {
        app.setAppUserModelId(APP_USER_MODEL_ID)
    }

    if (isMac) {
        // A menu-bar utility has no business in the Dock or the app switcher.
        app.setActivationPolicy('accessory')
        app.dock?.hide()

        const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'))
        if (!icon.isEmpty()) app.dock?.setIcon(icon)
    }
}

/**
 * Re-plans the timer and clears any overlay after the machine has been away.
 *
 * The timer has its own clock watchdog for environments that never emit these
 * events, but reacting directly is faster and covers the common case.
 */
function bindPowerEvents(): void {
    const wake = (reason: string) => {
        console.info(`[app] resuming after ${reason}`)
        closeAllWindows()
        closeReminder()
        startWorkTimer()
        updateTooltip()
    }

    powerMonitor.on('resume', () => wake('suspend'))
    powerMonitor.on('unlock-screen', () => wake('screen lock'))
    powerMonitor.on('shutdown', () => app.quit())
}

/**
 * Warns when the desktop provides nowhere to put the tray icon.
 *
 * Without this the app starts on such a system with no window and no icon, and
 * looks like it failed to launch.
 */
function warnAboutMissingTray(): void {
    const hint = isLinux
        ? 'Your desktop does not appear to provide a system tray. On GNOME, install the "AppIndicator and KStatusNotifierItem Support" extension, then restart BlinkBlink.'
        : 'BlinkBlink could not create its tray icon, so it has no menu. Please report this along with your OS version.'

    console.error('[app] tray unavailable:', hint)
    dialog.showMessageBox({
        type: 'warning',
        title: 'BlinkBlink needs a system tray',
        message: 'BlinkBlink could not add its tray icon.',
        detail: hint,
    })
}

export function setupApp(): void {
    nativeTheme.themeSource = 'system'
    applyPlatformIdentity()
    ensureUserId()

    const settings = getSettings()
    const firstRun = !hasCompletedFirstRun()

    registerController()
    registerReminder()

    if (!createTray()) warnAboutMissingTray()

    // Keep the OS-level startup entry in step with the stored preference; it
    // can drift if the app was moved or reinstalled from a different package.
    syncAutostart(settings.startOnBoot)

    startTimer()
    updateTooltip()
    startAutoUpdateTimer()
    bindPowerEvents()

    // The SDK was started before `whenReady` in main.ts; this only sends. A
    // launch that dies before this point is not a launch worth counting.
    reportAppStarted(settings, firstRun)

    if (firstRun) showTutorial()
    else showWhatsNewIfNeeded(firstRun)
}

export function teardownApp(): void {
    stopAutoUpdateTimer()
    stopTimer()
    closeReminder()
    closeAllWindows()
    destroyTray()
}
