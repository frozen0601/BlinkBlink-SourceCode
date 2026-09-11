/**
 * Electron adapter for `core/analytics`.
 *
 * The core module decides *what* is worth sending; this one owns the Aptabase
 * SDK and the app key, and is the only place either is touched.
 *
 * The key arrives through `process.env.APTABASE_API_KEY`, inlined at build time
 * by webpack's DefinePlugin exactly as `BLINKBLINK_SIGNED` is. It is not a
 * secret in any meaningful sense — it ships inside every binary and anyone can
 * read it out — but it still has to reach the runner, so CI passes it as a
 * repository secret. A build without one simply sends nothing, which is what
 * local development and forks get.
 */

import { app } from 'electron'
import { initialize, trackEvent } from '@aptabase/electron/main'
import { buildAppStartedEvent } from '../core/analytics'
import { Settings } from '../core/types'

const APP_KEY = process.env.APTABASE_API_KEY ?? ''

/**
 * Resolves to whether the SDK came up, never rejects.
 *
 * `initialize` is async, so an event sent immediately after calling it races
 * initialisation and is dropped. Holding the promise is what lets
 * `reportAppStarted` wait for it without making app startup wait for either.
 */
let initialized: Promise<boolean> | null = null

/**
 * Starts the SDK, if there is a key to start it with.
 *
 * Safe to call when the user has opted out: nothing is sent until something
 * calls `reportAppStarted`, and that returns early for an opted-out user. The
 * SDK is initialised regardless so that toggling the setting back on does not
 * require a restart to take effect.
 */
export function setupAnalytics(): void {
    if (initialized || !APP_KEY) return

    initialized = initialize(APP_KEY).then(
        () => true,
        (error) => {
            // Telemetry must never be the reason the app fails to start.
            console.error('[analytics] failed to initialise:', error)
            return false
        }
    )
}

/**
 * Sends the one event per launch described in `core/analytics`.
 *
 * Fire-and-forget by design, and every failure is swallowed deliberately: an
 * analytics outage, a blocked domain or a machine with no network are all
 * normal states for a desktop app, and none is worth surfacing to someone who
 * just wants a break timer. Both SDK calls return promises, so the swallowing
 * has to happen in `catch` handlers rather than a `try` block.
 */
export function reportAppStarted(settings: Settings, firstRun: boolean): void {
    if (!initialized) return

    const event = buildAppStartedEvent({
        settings,
        platform: process.platform,
        arch: process.arch,
        version: app.getVersion(),
        firstRun,
    })
    if (!event) return

    void initialized
        .then((ok) => {
            if (!ok) return
            // Resolving proves nothing: with no app key the SDK queues the
            // event and resolves anyway. A genuine failure shows up as an
            // "Aptabase:" warning on stderr, so that is what to look for when
            // running from a terminal — not this line.
            return trackEvent(event.name, event.props).then(() => console.info(`[analytics] ${event.name} handed to the SDK`))
        })
        .catch((error) => console.error('[analytics] failed to send event:', error))
}
