/** Electron-side adapter over the pure platform decisions in `core/platform`. */

import { app } from 'electron'
import * as os from 'os'
import {
    AutostartMechanism,
    PlatformFacts,
    UpdateDelivery,
    resolveAutostartMechanism,
    resolveBackdropMode,
    resolveUpdateDelivery,
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

export function platformFacts(): PlatformFacts {
    return {
        platform: process.platform,
        release: os.release(),
        sessionType: process.env.XDG_SESSION_TYPE,
        desktop: process.env.XDG_CURRENT_DESKTOP,
        isSnap: isSnap(),
        isAppImage: isAppImage(),
    }
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

export function getUpdateDelivery(): UpdateDelivery {
    return resolveUpdateDelivery(platformFacts())
}
