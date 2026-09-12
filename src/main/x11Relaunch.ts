/**
 * Restarting the app onto X11, without killing it.
 *
 * The reasoning for why this is needed at all, and why the child's environment
 * has to be cleaned, is in `core/x11Relaunch.ts`.
 *
 * The rule here is that failing to relaunch must never be worse than not
 * trying. A previous version used `app.relaunch` — which offers no control over
 * the child's environment — and exited immediately, so when the child died
 * there was nothing left running and the app simply did not start. This spawns
 * the replacement itself, waits to see it survive, and carries on running on
 * Wayland if it does not. The worst case is an overlay that appears in alt-tab,
 * never an app that will not open.
 */

import { spawn } from 'child_process'
import * as os from 'os'
import { childArguments, childEnvironment, shouldRelaunchOntoX11 } from '../core/x11Relaunch'

/**
 * How long to watch the replacement before trusting it.
 *
 * Long enough to catch the failure that matters — the dynamic loader dying on
 * a stale mount, which happens in milliseconds — and short enough that nobody
 * notices it on a launch that works.
 */
const GRACE_MS = 1500

function relaunchFacts() {
    return {
        platform: process.platform,
        waylandDisplay: process.env.WAYLAND_DISPLAY,
        display: process.env.DISPLAY,
        ozoneHint: process.env.ELECTRON_OZONE_PLATFORM_HINT,
        argv: process.argv,
        marker: process.env.BLINKBLINK_X11_RELAUNCH,
    }
}

/**
 * Hands over to a copy of this app running on X11, if that is worth doing.
 *
 * Resolves true when the caller should stop — a replacement is up and this
 * process is on its way out. Resolves false when the caller should carry on
 * exactly as it would have, whether because there was no reason to relaunch or
 * because the attempt did not take.
 */
export async function relaunchOntoX11IfNeeded(): Promise<boolean> {
    if (!shouldRelaunchOntoX11(relaunchFacts())) return false

    // Inside an AppImage `process.execPath` points into a mount that disappears
    // with this process. APPIMAGE is the file that can actually be run again.
    const command = process.env.APPIMAGE || process.execPath
    const args = childArguments(process.argv)
    const env = childEnvironment(process.env, process.env.APPDIR)

    let child
    try {
        child = spawn(command, args, {
            detached: true,
            stdio: 'ignore',
            env,
            // Not the inherited one. An AppImage's AppRun chdirs into its own
            // mount, and a child sitting there keeps the mount busy: the parent
            // can then never unmount it, so its runtime process lingers for
            // ever holding a squashfuse and a copy of the image. Measured —
            // without this the discarded process was still alive at 50s.
            cwd: os.homedir() || '/',
        })
    } catch (error) {
        console.warn('[app] could not start on XWayland, staying on Wayland:', error)
        return false
    }

    const survived = await new Promise<boolean>((resolve) => {
        let settled = false
        const finish = (value: boolean) => {
            if (settled) return
            settled = true
            resolve(value)
        }

        // Either of these means the replacement is not going to run, and this
        // process is the only one left that can.
        child.once('error', (error) => {
            console.warn('[app] the XWayland process failed to start, staying on Wayland:', error)
            finish(false)
        })
        child.once('exit', (code, signal) => {
            console.warn(`[app] the XWayland process died immediately (code ${code}, signal ${signal}), staying on Wayland`)
            finish(false)
        })

        setTimeout(() => finish(true), GRACE_MS)
    })

    if (!survived) return false

    child.unref()
    console.info('[app] handed over to a copy running on XWayland')
    return true
}
