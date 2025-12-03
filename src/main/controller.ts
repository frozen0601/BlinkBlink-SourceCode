import { getSettings } from './store'
import { startWorkTimer, clearTimer } from './timer'
import { showSummaryView, closeAllWindows } from './windows'
import { updateTooltip } from './tray'
import { updateBreakStats } from './stats'

export function handleBreakComplete() {
    updateBreakStats(false)
    showSummaryView()
    updateTooltip()
}

export function handleBreakSkip() {
    updateBreakStats(true)
    closeAllWindows()
    startWorkTimer()
    updateTooltip()
}

export function handleSummaryDismissed() {
    startWorkTimer()
    closeAllWindows()
    updateTooltip()
}

export function handleScheduleUpdated() {
    clearTimer()
    startWorkTimer()
    updateTooltip()
}
