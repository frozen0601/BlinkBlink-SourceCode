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
    /** True when running from an AppImage bundle. */
    isAppImage?: boolean
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
 * Whether the break overlay should be taken out of window management.
 *
 * On Linux `focusable: false` makes Electron create the window without handing
 * it to the window manager: it is always on top, on every workspace, and — the
 * reason it is worth doing — absent from the task switcher. KWin decides that
 * from `_KDE_NET_WM_STATE_SKIP_SWITCHER`, an atom Electron gives no way to set,
 * and `skipTaskbar` writes only SKIP_TASKBAR and SKIP_PAGER, which the switcher
 * ignores. Bypassing the window manager is the one lever that works.
 *
 * The cost is keyboard input: an unmanaged window never takes focus, so the
 * overlay's own Escape handler never fires. The main process registers Escape
 * as a global shortcut for as long as the overlay is up, which is what keeps
 * the break dismissable without a mouse.
 *
 * macOS and Windows keep a managed window: neither shows the overlay in a
 * switcher in the first place, and both would lose more than they gain.
 */
export function overlayBypassesWindowManager(facts: PlatformFacts): boolean {
    return facts.platform === 'linux'
}

export type UpdateDelivery =
    /** The app downloads and installs the update itself. */
    | 'in-app'
    /** The app fetches the installer; the user finishes the install. */
    | 'assisted'
    /** Something else owns the install: snap, apt, dnf. */
    | 'external'

/**
 * Who installs an update on this build.
 *
 * Windows NSIS builds carry a signature chain electron-updater can verify, and
 * an AppImage is a single file the app is allowed to replace — both install
 * themselves. Squirrel.Mac refuses to update an unsigned app, so macOS gets as
 * far as the DMG and hands over.
 *
 * deb, rpm and snap are deliberately external. electron-updater can drive all
 * three, but the deb and rpm paths shell out to a privileged installer behind
 * `pkexec` and would be writing over files that dnf and apt consider theirs,
 * and snap refreshes itself. The distinction is the packaging format rather
 * than the platform, which is why this takes the facts rather than asking
 * `process.platform`.
 */
export function resolveUpdateDelivery(facts: PlatformFacts): UpdateDelivery {
    switch (facts.platform) {
        case 'win32':
            return 'in-app'
        case 'darwin':
            return 'assisted'
        case 'linux':
            return facts.isAppImage ? 'in-app' : 'external'
        default:
            return 'external'
    }
}
