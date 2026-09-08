export {}

import { formatDuration } from '../core/format'

function setText(id: string, value: string): void {
    const element = document.getElementById(id)
    if (element) element.textContent = value
}

function formatTimestamp(value: number, empty: string): string {
    return value > 0 ? new Date(value).toLocaleString() : empty
}

window.api
    .getStats()
    .then((stats) => {
        setText('break-streak-count', String(stats.breakStreakCount ?? 0))
        setText('break-streak-duration', formatDuration(stats.breakStreakDuration))
        setText('current-work-streak-start-time', formatTimestamp(stats.streakStartTime, 'Not started'))

        setText('highest-streak-count', String(stats.highestStreakCount ?? 0))
        setText('highest-streak-duration', formatDuration(stats.highestStreakDuration))
        setText('highest-streak-start-time', formatTimestamp(stats.highestStreakStartTime, 'No streak yet'))
        setText('highest-streak-end-time', formatTimestamp(stats.highestStreakEndTime, 'No streak yet'))
    })
    .catch((error) => console.error('Failed to load stats:', error))
