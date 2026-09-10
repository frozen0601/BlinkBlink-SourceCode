/**
 * What telemetry the app sends, and whether it sends anything at all.
 *
 * The shape here is driven by a hard budget rather than by curiosity. The free
 * Aptabase tier allows 20,000 events a month; at roughly 167 daily users that
 * is about four events per user per day, and 0.1.2 blew straight through it by
 * sending one event per break — a break every twenty minutes of use is around
 * twenty-four events per user per day on its own.
 *
 * So the rule is: **one event per app launch, and everything else rides along
 * as a property.** Aptabase bills events, not properties, which makes a wide
 * event far cheaper than several narrow ones. `app_started` alone answers who
 * is new, who is active, which version they are on, which platform, and how
 * they have configured the app.
 *
 * Deliberately absent: any per-break event. Completion rate is worth having,
 * but it belongs in a once-a-day rollup rather than an event per break, and
 * that needs daily counters the store does not keep yet.
 */

import { Settings } from './types'

/** A single event, ready for whatever transport the main process uses. */
export interface AnalyticsEvent {
    name: string
    /**
     * Flat scalars only. Aptabase charts numbers and groups strings; nested
     * objects are not rendered, and unbounded strings make the dashboard
     * unreadable — which is why `language` was commented out in 0.1.2.
     */
    props: Record<string, string | number>
}

export interface AppStartedInput {
    settings: Settings
    /** `process.platform`. */
    platform: string
    /** `app.getVersion()`. */
    version: string
    /** True when this launch is the first the store has seen. */
    firstRun: boolean
}

/**
 * Whether anything may be sent at all.
 *
 * Analytics are on by default and switched off in Settings. The check lives
 * here so that no caller has to remember it, and so it is covered by a test.
 */
export function isAnalyticsEnabled(settings: Settings): boolean {
    return settings.enableAnalytics
}

/**
 * The one event the app sends per launch, or null when the user has opted out.
 *
 * Booleans go out as 0/1 rather than "true"/"false": Aptabase treats numeric
 * properties as measures it can average, so a 0/1 property reads directly as
 * "what share of launches had this on".
 */
export function buildAppStartedEvent(input: AppStartedInput): AnalyticsEvent | null {
    const { settings, platform, version, firstRun } = input
    if (!isAnalyticsEnabled(settings)) return null

    return {
        name: 'app_started',
        props: {
            platform,
            version,
            first_run: firstRun ? 1 : 0,
            // Settings distribution, folded in rather than sent as its own
            // `settings_values` event the way 0.1.2 did.
            reminder_style: settings.reminderStyle,
            overlay_backdrop: settings.overlayBackdrop,
            work_minutes: Math.round(settings.workDuration / 60000),
            break_seconds: Math.round(settings.breakDuration / 1000),
            start_on_boot: settings.startOnBoot ? 1 : 0,
            auto_update: settings.autoUpdate ? 1 : 0,
            schedule_enabled: settings.scheduleEnabled ? 1 : 0,
            break_notification: settings.enableBreakNotification ? 1 : 0,
            sound_notification: settings.enableSoundNotification ? 1 : 0,
            auto_dismiss: settings.enableAutoDismiss ? 1 : 0,
        },
    }
}
