/**
 * Deciding what the break timer should do next.
 *
 * Separated from the Electron timer so the rules — schedules, skips, the end of
 * the working day — can be tested directly instead of by waiting 20 minutes.
 */

import { getCurrentRangeEnd, getNextActiveTime, isWithinActiveHours } from './schedule'
import { WeeklySchedule } from './types'

/** `setTimeout` stores its delay in a signed 32-bit int; longer waits fire immediately. */
export const MAX_TIMEOUT_MS = 2 ** 31 - 1

export interface TimerPlanInput {
    now: Date
    workDuration: number
    scheduleEnabled: boolean
    schedule: WeeklySchedule
    /** Breaks are suppressed until this instant, if set. */
    skipUntil?: Date | null
}

export type TimerPlan =
    /** Show the break overlay at `at`. */
    | { kind: 'break'; at: Date }
    /** Nothing to do until `until`; re-plan when that arrives. */
    | { kind: 'wait'; until: Date; reason: 'outside-schedule' | 'skipped' }
    /** The schedule never becomes active again. Nothing to arm. */
    | { kind: 'idle' }

/**
 * Works out the next timer action.
 *
 * The two behaviours worth calling out, because the previous implementation got
 * them wrong and simply stopped arming anything:
 *
 * - Outside working hours the app *waits* for the next stretch and only then
 *   starts a fresh work interval, rather than firing a break the instant the
 *   working day opens.
 * - A work interval that would run past the end of the working day does not
 *   produce a truncated break at the boundary; it waits for the next stretch.
 */
export function planNextBreak(input: TimerPlanInput): TimerPlan {
    const { now, workDuration, scheduleEnabled, schedule, skipUntil } = input

    const skipping = skipUntil instanceof Date && skipUntil.getTime() > now.getTime()
    const candidate = skipping ? new Date(skipUntil.getTime()) : new Date(now.getTime() + Math.max(1, workDuration))

    if (!scheduleEnabled) {
        return { kind: 'break', at: candidate }
    }

    if (!isWithinActiveHours(schedule, now)) {
        const nextActive = getNextActiveTime(schedule, now)
        return nextActive ? { kind: 'wait', until: nextActive, reason: 'outside-schedule' } : { kind: 'idle' }
    }

    const rangeEnd = getCurrentRangeEnd(schedule, now)

    // Inside an active stretch and the break lands before it closes.
    if (!rangeEnd || candidate.getTime() < rangeEnd.getTime()) {
        return { kind: 'break', at: candidate }
    }

    // The break would fall after the working day ends. Skip to the next stretch
    // rather than squeezing a break in at the boundary.
    const nextActive = getNextActiveTime(schedule, rangeEnd)
    if (!nextActive) return { kind: 'idle' }

    return { kind: 'wait', until: nextActive, reason: skipping ? 'skipped' : 'outside-schedule' }
}

/**
 * When to surface the pre-break reminder, or `null` when there is no room for
 * one before the break itself.
 */
export function planReminder(breakAt: Date, offsetMs: number, now: Date): Date | null {
    if (offsetMs <= 0) return null
    const at = breakAt.getTime() - offsetMs
    if (at <= now.getTime()) return null
    return new Date(at)
}

/**
 * Clamps a delay to something `setTimeout` can represent.
 *
 * Callers re-plan when a clamped timer fires, so a multi-week wait still
 * resolves correctly, just in several hops.
 */
export function clampDelay(ms: number): number {
    if (!Number.isFinite(ms) || ms < 0) return 0
    return Math.min(ms, MAX_TIMEOUT_MS)
}

/**
 * Detects that the wall clock moved independently of elapsed time — a laptop
 * that slept without emitting a power event, a VM resuming, a manual clock
 * change. Any of those invalidate an armed `setTimeout`.
 */
export function clockJumped(expectedElapsedMs: number, actualElapsedMs: number, toleranceMs = 5000): boolean {
    return Math.abs(actualElapsedMs - expectedElapsedMs) > toleranceMs
}
