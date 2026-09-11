/**
 * Installing a macOS update in place.
 *
 * Mounts the downloaded disk image, checks what is inside it, copies the new
 * bundle next to the running one and swaps the two — the drag the user used to
 * do by hand. Every step that touches the installed app is ordered so that a
 * failure leaves the working app where it was:
 *
 *   1. copy into `BlinkBlink.app.new-<pid>`   — nothing installed is touched
 *   2. rename the installed app to `.old-<pid>`
 *   3. rename the new one into its place      — the only irreversible moment
 *   4. delete the retired bundle
 *
 * If step 3 fails, step 2 is undone and the original is back. Anything earlier
 * failing just leaves a stray directory that is cleaned up on the way out.
 *
 * Unverified on a real Mac at the time of writing: there is no macOS runner
 * here. Every failure path therefore falls back to the old behaviour — reveal
 * the DMG and point at the install guide — rather than leaving someone with no
 * app at all.
 */

import { app } from 'electron'
import { execFile } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import { checkDownloadedBundle, planInPlaceInstall, retiredPath, stagingPath } from '../core/macInstall'
import { isNewerVersion } from '../core/update'
import { APP_ID } from './appSetup'

const run = promisify(execFile)

export interface InstallOutcome {
    installed: boolean
    /** Why it could not be done in place, for the log and the fallback message. */
    reason?: string
}

/** The `.app` bundle this process is running from, or null if it is not in one. */
export function runningBundlePath(): string | null {
    // .../BlinkBlink.app/Contents/MacOS/BlinkBlink
    const marker = `${path.sep}Contents${path.sep}MacOS${path.sep}`
    const index = app.getPath('exe').indexOf(marker)
    return index === -1 ? null : app.getPath('exe').slice(0, index)
}

async function attach(dmgPath: string): Promise<string> {
    // -nobrowse keeps it out of Finder, -noautoopen stops a window appearing,
    // and the plist output is the only format worth parsing.
    const { stdout } = await run('hdiutil', ['attach', dmgPath, '-nobrowse', '-noautoopen', '-readonly', '-plist'])
    const mount = /<key>mount-point<\/key>\s*<string>([^<]+)<\/string>/.exec(stdout)
    if (!mount) throw new Error('the disk image mounted with no mount point')
    return mount[1]
}

async function detach(mountPoint: string): Promise<void> {
    try {
        await run('hdiutil', ['detach', mountPoint, '-quiet'])
    } catch (error) {
        // A busy mount is untidy, not broken; the user can eject it.
        console.warn('[updater] could not detach the disk image:', error)
    }
}

/**
 * Replaces the running app with the one inside `dmgPath`.
 *
 * Returns rather than throws: the caller has a working fallback, and an update
 * that cannot install itself is a disappointment rather than an error.
 */
export async function installFromDmg(dmgPath: string): Promise<InstallOutcome> {
    const bundlePath = runningBundlePath()
    if (!bundlePath) return { installed: false, reason: 'the app is not running from a bundle' }

    const plan = planInPlaceInstall(bundlePath, app.isPackaged)
    if (plan.kind === 'manual') return { installed: false, reason: plan.reason }

    // The swap is two renames within this directory, so it has to be writable.
    try {
        await fs.promises.access(path.dirname(bundlePath), fs.constants.W_OK)
    } catch {
        return { installed: false, reason: 'the folder the app is installed in is not writable' }
    }

    const suffix = String(process.pid)
    const staging = stagingPath(bundlePath, suffix)
    const retired = retiredPath(bundlePath, suffix)
    let mountPoint: string | null = null

    try {
        mountPoint = await attach(dmgPath)

        const source = path.join(mountPoint, path.basename(bundlePath))
        const plist = await fs.promises.readFile(path.join(source, 'Contents', 'Info.plist'), 'utf-8')
        const check = checkDownloadedBundle(plist, APP_ID, app.getVersion(), isNewerVersion)
        if (!check.ok) return { installed: false, reason: check.reason }

        // `ditto` rather than cp: it preserves the bundle's symlinks, resource
        // forks and extended attributes, which a plain copy quietly flattens.
        await fs.promises.rm(staging, { recursive: true, force: true })
        await run('ditto', [source, staging])

        // The copy inherits the download's quarantine flag, which is what would
        // put the app back behind Gatekeeper on first launch.
        await run('xattr', ['-cr', staging])

        await fs.promises.rename(bundlePath, retired)
        try {
            await fs.promises.rename(staging, bundlePath)
        } catch (error) {
            await fs.promises.rename(retired, bundlePath)
            throw error
        }

        await fs.promises.rm(retired, { recursive: true, force: true })
        return { installed: true }
    } catch (error) {
        console.error('[updater] in-place install failed:', error)
        await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => undefined)
        return { installed: false, reason: error instanceof Error ? error.message : 'the update could not be installed' }
    } finally {
        if (mountPoint) await detach(mountPoint)
    }
}

/**
 * Quits and starts the replacement.
 *
 * `relaunch` spawns after this process exits, which is what keeps the new
 * instance from meeting the old one at the single-instance lock.
 */
export function restartIntoNewVersion(): void {
    app.relaunch()
    app.quit()
}
