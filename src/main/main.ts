/** Entry point: process-level concerns only. Wiring lives in `appSetup`. */

import { app } from 'electron'
import { setupAnalytics } from './analytics'
import { CLI_HELP, parseArgv } from './cli'
import { registerIpcHandlers } from './ipcHandlers'
import { setupApp, teardownApp } from './appSetup'
import { createSettingsWindow, createStatsWindow } from './tray'
import { showBreakView } from './windows'

/** Applies a parsed command line to the running app. */
function actOnIntent(argv: readonly string[], openSettingsByDefault: boolean): void {
    const intent = parseArgv(argv)

    if (intent.takeBreak) showBreakView()
    else if (intent.openStats) createStatsWindow()
    else if (intent.openSettings) createSettingsWindow()
    else if (openSettingsByDefault && !intent.hidden) createSettingsWindow()
}

if (process.argv.includes('--help')) {
    process.stdout.write(CLI_HELP)
    app.quit()
} else if (!app.requestSingleInstanceLock()) {
    // A second instance would run its own tray icon and its own break timer,
    // and the two would fight over the same settings file. Hand the launch to
    // the instance that is already running instead.
    console.info('[app] another instance is already running; handing over')
    app.quit()
} else {
    app.on('second-instance', (_event, argv) => {
        // A relaunch with no flags is someone looking for the app, so show
        // them something rather than appearing to do nothing.
        if (app.isReady()) actOnIntent(argv, true)
    })

    registerIpcHandlers()

    // Before `whenReady`, and not in `setupApp` with everything else: the
    // Aptabase SDK refuses to start once the app is ready, because it registers
    // a privileged scheme that has to be declared beforehand. Called too late it
    // disables itself with a warning, and `trackEvent` then queues events
    // forever while still resolving as though it had sent them.
    setupAnalytics()

    app.whenReady().then(
        () => {
            setupApp()
            actOnIntent(process.argv, false)
        },
        (error) => {
            console.error('[app] failed to start:', error)
            app.quit()
        }
    )

    // The tray is the app's real presence, so closing the last window is not a
    // reason to quit on any platform.
    app.on('window-all-closed', () => {})

    app.on('before-quit', teardownApp)
}

process.on('uncaughtException', (error) => {
    console.error('[app] uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
    console.error('[app] unhandled rejection:', reason)
})
