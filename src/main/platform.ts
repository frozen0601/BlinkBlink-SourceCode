/** Electron-side adapter over the pure platform decisions in `core/platform`. */

import { app } from 'electron'
import * as os from 'os'
import {
    AutostartMechanism,
    PlatformFacts,
    UpdateDelivery,
    resolveAutostartMechanism,
    resolveBackdropMode,
    overlayBypassesWindowManager,
    resolveUpdateDelivery,
    shouldForceX11,
    supportsNotificationActions,
} from '../core/platform'
import { BackdropMode, BackdropPreference } from '../core/types'

export const isMac = process.platform === 'darwin'
export const isWindows = process.platform === 'win32'
export const isLinux = process.platform === 'linux'

/** True when the process is running inside snap confinement. */
export function isSnap(): boolean {
    return isLinux && typeof process.env.SNAP === 'string' && process.env.SNAP.length > 0
}

/** True when running from a Flatpak sandbox. */
export function isFlatpak(): boolean {
    return isLinux && typeof process.env.FLATPAK_ID === 'string'
}

/** True when running from an AppImage bundle. */
export function isAppImage(): boolean {
    return isLinux && typeof process.env.APPIMAGE === 'string'
}

/** An explicit backend choice, from the environment or the command line. */
function ozoneChoice(): string | undefined {
    const fromEnvironment = process.env.ELECTRON_OZONE_PLATFORM_HINT
    if (fromEnvironment) return fromEnvironment

    const fromArgv = process.argv.find((argument) => argument.startsWith('--ozone-platform'))
    return fromArgv || undefined
}

export function platformFacts(): PlatformFacts {
    return {
        platform: process.platform,
        release: os.release(),
        sessionType: process.env.XDG_SESSION_TYPE,
        desktop: process.env.XDG_CURRENT_DESKTOP,
        isSnap: isSnap(),
        isAppImage: isAppImage(),
        display: process.env.DISPLAY,
        waylandDisplay: process.env.WAYLAND_DISPLAY,
        ozoneChoice: ozoneChoice(),
    }
}

/**
 * Restarts onto X11 when Electron has picked the Wayland backend.
 *
 * The backend is chosen before the main script runs, so it can only be set on
 * the process command line. Measured, not assumed: with `WAYLAND_DISPLAY` set,
 * `--ozone-platform=x11` on the command line produces an override-redirect X11
 * window, while `app.commandLine.appendSwitch` from here and
 * `ELECTRON_OZONE_PLATFORM_HINT=x11` in the environment both leave the app on
 * Wayland. Re-executing is the only lever the app has.
 *
 * Called before the single-instance lock and before anything is created, so the
 * discarded process never draws a tray icon or a window — from outside it is a
 * slower start, not a restart. It can only happen once: the relaunched process
 * carries `--ozone-platform=x11`, which `ozoneChoice` reads as a deliberate
 * choice, so `shouldForceX11` is false the second time round.
 *
 * Returns true when the caller should stop and let the replacement take over.
 */
export function relaunchOntoX11IfNeeded(): boolean {
    if (!shouldForceX11(platformFacts())) return false

    // Inside an AppImage `process.execPath` is a path in a mount that vanishes
    // with this process; APPIMAGE is the file that can actually be re-run.
    const execPath = process.env.APPIMAGE || undefined
    const args = [...process.argv.slice(1), '--ozone-platform=x11']

    console.info('[app] restarting on XWayland: a Wayland window cannot stay out of the task switcher')
    app.relaunch({ execPath, args })
    app.exit(0)
    return true
}

/**
 * Whether the running app is code signed.
 *
 * Only macOS is interesting here — an unsigned bundle never shows notification
 * action buttons. Electron offers no runtime answer, so the build tells us:
 * webpack inlines `process.env.BLINKBLINK_SIGNED` at compile time, and the
 * release workflow sets it only when a signing certificate was supplied. An
 * unpackaged dev build is never signed.
 */
export function isCodeSigned(): boolean {
    if (!app.isPackaged) return false
    if (!isMac) return true
    return process.env.BLINKBLINK_SIGNED === '1'
}

export function getBackdropMode(preference: BackdropPreference = 'auto'): BackdropMode {
    return resolveBackdropMode(platformFacts(), preference)
}

export function getAutostartMechanism(): AutostartMechanism {
    return resolveAutostartMechanism(platformFacts())
}

export function canShowNotificationActions(): boolean {
    return supportsNotificationActions(platformFacts(), isCodeSigned())
}

export function overlayShouldBypassWm(): boolean {
    return overlayBypassesWindowManager(platformFacts())
}

export function getUpdateDelivery(): UpdateDelivery {
    return resolveUpdateDelivery(platformFacts())
}
