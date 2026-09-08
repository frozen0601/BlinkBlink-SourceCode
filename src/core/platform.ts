/**
 * Platform capability decisions, kept pure so they can be unit tested.
 *
 * The main process feeds in the real `process.platform` / `os.release()` /
 * environment values; everything here is plain data in, plain data out.
 */

import { BackdropMode, BackdropPreference } from './types'

export type PlatformId = 'darwin' | 'win32' | 'linux' | (string & {})

/** First Windows build with a usable DWM backdrop material (Windows 11 22H2). */
export const WINDOWS_ACRYLIC_MIN_BUILD = 22621

export interface PlatformFacts {
    platform: PlatformId
    /** `os.release()` — on Windows this is "10.0.<build>". */
    release: string
    /** `XDG_SESSION_TYPE`, if set. */
    sessionType?: string
    /** `XDG_CURRENT_DESKTOP`, if set. */
    desktop?: string
    /** True when running from inside a snap confinement. */
    isSnap?: boolean
}

/** Parses the build number out of an `os.release()` string like "10.0.22631". */
export function windowsBuildNumber(release: string): number {
    const parts = release.split('.')
    const build = Number(parts[2])
    return Number.isFinite(build) ? build : 0
}

export function supportsWindowsAcrylic(facts: PlatformFacts): boolean {
    return facts.platform === 'win32' && windowsBuildNumber(facts.release) >= WINDOWS_ACRYLIC_MIN_BUILD
}

/**
 * Picks how the break overlay paints its backdrop.
 *
 * Only macOS and Windows 11 22H2+ can actually blur what is behind a window.
 * CSS `backdrop-filter` cannot: it only sees the window's own web contents, so
 * on every other platform the honest answer is a translucent scrim over a
 * transparent window — and, where even that is unreliable, an opaque one.
 */
export function resolveBackdropMode(facts: PlatformFacts, preference: BackdropPreference = 'auto'): BackdropMode {
    if (preference === 'solid') return 'solid'
    if (preference === 'translucent') return 'translucent'

    switch (facts.platform) {
        case 'darwin':
            return 'vibrancy'
        case 'win32':
            return supportsWindowsAcrylic(facts) ? 'acrylic' : 'translucent'
        case 'linux':
            // Every mainstream Linux desktop composites, and where it does not
            // a transparent window simply renders black — which is what the
            // heavy scrim looks like anyway, so this degrades gracefully.
            return 'translucent'
        default:
            return 'solid'
    }
}

/** Whether the overlay window itself must be created with `transparent: true`. */
export function backdropNeedsTransparentWindow(mode: BackdropMode): boolean {
    return mode === 'vibrancy' || mode === 'translucent'
}

export type AutostartMechanism =
    /** `app.setLoginItemSettings`, which Electron implements on macOS and Windows. */
    | 'login-item'
    /** A `.desktop` file dropped into `~/.config/autostart`. */
    | 'xdg-autostart'
    /** Managed by the packaging format; the app must not touch it. */
    | 'unsupported'

/**
 * How "start on login" should be implemented.
 *
 * `app.setLoginItemSettings` is a no-op on Linux, which is why the checkbox
 * silently did nothing there. Snap confinement blocks writes to the host's
 * autostart directory, so inside a snap the honest answer is "unsupported".
 */
export function resolveAutostartMechanism(facts: PlatformFacts): AutostartMechanism {
    switch (facts.platform) {
        case 'darwin':
        case 'win32':
            return 'login-item'
        case 'linux':
            return facts.isSnap ? 'unsupported' : 'xdg-autostart'
        default:
            return 'unsupported'
    }
}

/**
 * Whether native notification *action buttons* can be expected to appear.
 *
 * macOS only renders them for a signed app whose Info.plist sets
 * `NSUserNotificationAlertStyle` to `alert`. BlinkBlink ships unsigned, so on
 * macOS the button is never drawn and a notification-only reminder loses its
 * "skip" affordance entirely.
 */
export function supportsNotificationActions(facts: PlatformFacts, isSigned: boolean): boolean {
    if (facts.platform === 'darwin') return isSigned
    // Windows toasts and libnotify both render actions without extra ceremony.
    return facts.platform === 'win32' || facts.platform === 'linux'
}

/**
 * Whether in-app updates can install themselves.
 *
 * Linux builds are updated by the package manager or the snap store, and
 * unsigned macOS builds cannot use Squirrel.Mac, so only Windows gets the
 * fully automatic path.
 */
export function supportsInAppUpdateInstall(facts: PlatformFacts): boolean {
    return facts.platform === 'win32'
}
