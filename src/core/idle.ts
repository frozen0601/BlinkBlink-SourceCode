/**
 * Deciding what to do when nobody is at the keyboard.
 *
 * A break that fires while you are away is worse than no break at all: you
 * miss it, and the next work interval starts from the wrong moment, so the
 * following break arrives too early. The rule is to hold the break until you
 * come back and then start a fresh interval.
 */

export interface IdlePolicy {
    enabled: boolean
    /** Idle time at or beyond which the user counts as away, in milliseconds. */
    thresholdMs: number
}

/** Whether the user should be treated as away from the machine. */
export function isAway(idleMs: number, policy: IdlePolicy): boolean {
    if (!policy.enabled) return false
    if (!Number.isFinite(idleMs) || idleMs < 0) return false
    return idleMs >= policy.thresholdMs
}

/**
 * Whether a break that came due right now should be held back.
 *
 * Separate from `isAway` because the answer is also no when the feature is off,
 * and because the caller reads better at the call site.
 */
export function shouldDeferBreak(idleMs: number, policy: IdlePolicy): boolean {
    return isAway(idleMs, policy)
}

/**
 * Whether time away already counts as a break.
 *
 * Stepping away for longer than the break itself has rested your eyes at least
 * as well as the overlay would have. The streak is deliberately not credited —
 * it counts breaks actually taken with the app, and awarding one for walking
 * away would make the number meaningless.
 */
export function idleCountsAsBreak(idleMs: number, breakDurationMs: number): boolean {
    if (!Number.isFinite(idleMs) || idleMs <= 0) return false
    return idleMs >= breakDurationMs
}
