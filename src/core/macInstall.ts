/**
 * Deciding whether a macOS update can be installed in place.
 *
 * Squirrel.Mac will not touch an unsigned app, so the app has always fetched
 * the DMG and asked the user to drag it over the running one. It can do that
 * drag itself: mount the image, verify what is inside it, copy the new bundle
 * next to the old one and swap them. That is ordinary file work, and it is
 * exactly what someone does by hand.
 *
 * Everything here is a decision about strings and paths, kept out of `main/`
 * so the rules can be tested somewhere without a /Applications to break.
 */

export type InstallPlan =
    /** Replace the bundle at this path. */
    | { kind: 'replace'; bundlePath: string }
    /** Not possible here; the caller falls back to opening the DMG. */
    | { kind: 'manual'; reason: string }

/**
 * Whether this install can replace itself.
 *
 * `appPath` is `app.getAppPath()`-adjacent — the caller passes the `.app`
 * bundle. A development build is refused because there is no bundle to swap,
 * and anything that is not a `.app` is refused because the swap would then be
 * moving something this code does not understand.
 */
export function planInPlaceInstall(bundlePath: string, isPackaged: boolean): InstallPlan {
    if (!isPackaged) return { kind: 'manual', reason: 'this is a development build' }
    if (!bundlePath.endsWith('.app')) return { kind: 'manual', reason: 'the app is not running from a bundle' }

    // Running from inside the disk image it was downloaded as: replacing that
    // would write into a read-only mount, and the user has not installed the
    // app at all yet.
    if (bundlePath.startsWith('/Volumes/')) return { kind: 'manual', reason: 'the app is running from a mounted disk image' }

    return { kind: 'replace', bundlePath }
}

/** Reads one string value out of an Info.plist, or null if it is not there. */
export function readPlistString(plist: string, key: string): string | null {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = new RegExp(`<key>${escaped}</key>\\s*<string>([^<]*)</string>`).exec(plist)
    return match ? match[1] : null
}

export interface BundleCheck {
    ok: boolean
    reason?: string
}

/**
 * Whether the bundle found on the mounted image is the one we expect.
 *
 * The swap is irreversible from the user's point of view, so this refuses
 * anything surprising rather than trying to cope with it: a different app, or a
 * version that is not actually newer than the one running.
 */
export function checkDownloadedBundle(
    plist: string,
    expectedId: string,
    currentVersion: string,
    isNewer: (a: string, b: string) => boolean
): BundleCheck {
    const id = readPlistString(plist, 'CFBundleIdentifier')
    if (id === null) return { ok: false, reason: 'the downloaded bundle has no identifier' }
    if (id !== expectedId) return { ok: false, reason: `the downloaded bundle is ${id}, not ${expectedId}` }

    const version = readPlistString(plist, 'CFBundleShortVersionString')
    if (version === null) return { ok: false, reason: 'the downloaded bundle has no version' }
    if (!isNewer(version, currentVersion))
        return { ok: false, reason: `the downloaded bundle is ${version}, which is not newer than ${currentVersion}` }

    return { ok: true }
}

/** Where the new bundle is staged: beside the old one, so the swap is a rename. */
export function stagingPath(bundlePath: string, suffix: string): string {
    return `${bundlePath}.new-${suffix}`
}

/** Where the old bundle waits while the new one moves in. */
export function retiredPath(bundlePath: string, suffix: string): string {
    return `${bundlePath}.old-${suffix}`
}
