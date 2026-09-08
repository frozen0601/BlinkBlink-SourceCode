import { getStats, getWorkDuration, setStats, updateLastBreakEndTime } from './store'
import { BreakOutcome, reduceBreakOutcome } from '../core/stats'

export function updateBreakStats(outcome: BreakOutcome): void {
    const now = Date.now()
    setStats(reduceBreakOutcome(getStats(), { outcome, at: now, workDuration: getWorkDuration() }))
    updateLastBreakEndTime(now)
}
