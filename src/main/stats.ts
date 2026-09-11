import { addBreakToHistory, getStats, getWorkDuration, setStats, updateLastBreakEndTime } from './store'
import { BreakOutcome, reduceBreakOutcome } from '../core/stats'

export function updateBreakStats(outcome: BreakOutcome): void {
    const now = Date.now()
    setStats(reduceBreakOutcome(getStats(), { outcome, at: now, workDuration: getWorkDuration() }))
    // The streak counters answer "how am I doing right now"; the history answers
    // "how has this been going", which needs a row per day rather than a total.
    addBreakToHistory(outcome, new Date(now))
    updateLastBreakEndTime(now)
}
