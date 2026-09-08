/**
 * Pure break-streak bookkeeping.
 *
 * `reduceBreakOutcome` is a total function of (previous stats, what happened,
 * when) so the rules can be exercised without an app around them.
 */

import { Stats } from './types'

export type BreakOutcome = 'completed' | 'skipped'

export interface BreakEvent {
    outcome: BreakOutcome
    /** When the break ended, as a millisecond timestamp. */
    at: number
    /** Length of the work interval that earned this break, in milliseconds. */
    workDuration: number
}

export function reduceBreakOutcome(stats: Stats, event: BreakEvent): Stats {
    if (event.outcome === 'skipped') {
        // A skip resets the running streak but never the personal best.
        return {
            ...stats,
            breakStreakCount: 0,
            breakStreakDuration: 0,
            streakStartTime: event.at,
        }
    }

    const count = stats.breakStreakCount + 1
    const duration = stats.breakStreakDuration + Math.max(0, event.workDuration)
    // The first break of a streak establishes its start time.
    const streakStartTime = stats.breakStreakCount === 0 || stats.streakStartTime === 0 ? event.at : stats.streakStartTime

    const next: Stats = {
        ...stats,
        breakStreakCount: count,
        breakStreakDuration: duration,
        streakStartTime,
    }

    if (count > stats.highestStreakCount) {
        next.highestStreakCount = count
        next.highestStreakDuration = duration
        next.highestStreakStartTime = streakStartTime
        next.highestStreakEndTime = event.at
    }

    return next
}
