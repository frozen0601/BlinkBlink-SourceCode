/** Entry point: process-level concerns only. Wiring lives in `appSetup`. */

import { app } from 'electron'
import { setupAnalytics } from './analytics'
import { CLI_HELP, parseArgv } from './cli'
import { registerIpcHandlers } from './ipcHandlers'
import { setupApp, teardownApp } from './appSetup'
import { createSettingsWindow, createStatsWindow } from './tray'
import { showBreakView } from './windows'
import { relaunchOntoX11IfNeeded } from './x11Relaunch'

/** Applies a parsed command line to the running app. */
function actOnIntent(argv: readonly string[], openSettingsByDefault: boolean): void {
    const intent = parseArgv(argv)

    if (intent.takeBreak) showBreakView()
    else if (intent.openStats) createStatsWindow()
    else if (intent.openSettings) createSettingsWindow()
    else if (openSettingsByDefault && !intent.hidden) createSettingsWindow()
}

/**
 * Rehearses the in-place update, for real, against this bundle.
 *
 * Deliberately handled before the single-instance lock and before anything is
 * set up: macOS grants or refuses the right to replace an app bundle based on
 * the identity of the process asking, so the only faithful test is BlinkBlink's
 * own binary doing it to BlinkBlink's own bundle. A shell script running the
 * same four commands tests the terminal instead.
 */
function rehearseInstall(dmgPath: string): void {
    import('./macInstall')
        .then(({ installFromDmg }) => installFromDmg(dmgPath))
        .then((outcome) => {
            if (outcome.installed) process.stdout.write('installed: this bundle has been replaced by the one in the image\n')
            else process.stdout.write(`not installed: ${outcome.reason}\n`)
        })
        .catch((error) => process.stdout.write(`not installed: ${error instanceof Error ? error.message : String(error)}\n`))
        .finally(() => app.exit(0))
}

/**
 * Ends this process once a replacement has taken over.
 *
 * SIGTERM rather than `app.exit`, and the difference is measurable inside an
 * AppImage. The AppImage runtime is the FUSE server for the squashfs it mounted
 * and tears the mount down when the app it launched exits; `app.exit` left it
 * asleep in `fuse_dev_do_read` with the mount still up, so every launch on a
 * Wayland session leaked a runtime process and a mount point. Quitting the way
 * a session manager would lets the runtime finish its own teardown. `app.exit`
 * stays as the fallback in case the signal is not honoured.
 */
function standDown(): void {
    process.kill(process.pid, 'SIGTERM')
    setTimeout(() => app.exit(0), 2000)
}

const tryInstall = parseArgv(process.argv).tryInstall

if (process.argv.includes('--help')) {
    process.stdout.write(CLI_HELP)
    app.quit()
} else if (tryInstall) {
    if (process.platform === 'darwin') rehearseInstall(tryInstall)
    else {
        process.stdout.write('--try-install is macOS only\n')
        app.exit(2)
    }
} else {
    registerIpcHandlers()

    // Before `whenReady`, and not in `setupApp` with everything else: the
    // Aptabase SDK refuses to start once the app is ready, because it registers
    // a privileged scheme that has to be declared beforehand. Called too late it
    // disables itself with a warning, and `trackEvent` then queues events
    // forever while still resolving as though it had sent them.
    //
    // This is the one thing the handover below does not wait for. It sends
    // nothing on its own — the "app started" event comes from `setupApp` — so a
    // process that turns out to be handing over has only initialised a client
    // and thrown it away.
    setupAnalytics()

    void start()
}

/**
 * Starts the app, unless a copy on X11 is going to do it instead.
 *
 * The handover is resolved before the single-instance lock is taken: the
 * replacement needs that lock, and a parent holding it would turn its own
 * child away.
 */
async function start(): Promise<void> {
    if (await relaunchOntoX11IfNeeded()) {
        standDown()
        return
    }

    // A second instance would run its own tray icon and its own break timer,
    // and the two would fight over the same settings file. Hand the launch to
    // the instance that is already running instead.
    if (!app.requestSingleInstanceLock()) {
        console.info('[app] another instance is already running; handing over')
        app.quit()
        return
    }

    app.on('second-instance', (_event, argv) => {
        // A relaunch with no flags is someone looking for the app, so show
        // them something rather than appearing to do nothing.
        if (app.isReady()) actOnIntent(argv, true)
    })

    // The tray is the app's real presence, so closing the last window is not a
    // reason to quit on any platform.
    app.on('window-all-closed', () => {})
    app.on('before-quit', teardownApp)

    try {
        await app.whenReady()
    } catch (error) {
        console.error('[app] failed to start:', error)
        app.quit()
        return
    }

    setupApp()
    actOnIntent(process.argv, false)
}

process.on('uncaughtException', (error) => {
    console.error('[app] uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
    console.error('[app] unhandled rejection:', reason)
})
