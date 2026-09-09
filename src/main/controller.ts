/**
 * Break lifecycle wiring.
 *
 * The timer, the overlay and the tray all talk through here rather than
 * importing each other directly. The tray refreshes itself from the
 * `timer-changed` event, so nothing here has to remember to update it.
 */

import { appEvents } from './events'
import { updateBreakStats } from './stats'
import { startWorkTimer } from './timer'
import { closeAllWindows, showBreakView, showSummaryView } from './windows'

export function handleBreakComplete(): void {
    updateBreakStats('completed')
    showSummaryView()
}

export function handleBreakSkip(): void {
    updateBreakStats('skipped')
    closeAllWindows()
    startWorkTimer()
}

export function handleSummaryDismissed(): void {
    closeAllWindows()
    startWorkTimer()
}

export function handleScheduleUpdated(): void {
    startWorkTimer()
}

/** Subscribes the controller to timer signals. Call once during startup. */
export function registerController(): void {
    appEvents.on('break-due', () => showBreakView())
}
