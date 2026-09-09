import { describe, expect, it } from 'vitest'
import { idleCountsAsBreak, isAway, shouldDeferBreak } from '../src/core/idle'
import { MINUTE, SECOND } from '../src/core/settings'

const policy = { enabled: true, thresholdMs: 5 * MINUTE }

describe('isAway', () => {
    it('is true at or beyond the threshold', () => {
        expect(isAway(5 * MINUTE, policy)).toBe(true)
        expect(isAway(30 * MINUTE, policy)).toBe(true)
    })

    it('is false below it', () => {
        expect(isAway(0, policy)).toBe(false)
        expect(isAway(5 * MINUTE - 1, policy)).toBe(false)
    })

    it('is false when the feature is off, however long the idle time', () => {
        expect(isAway(6 * MINUTE, { ...policy, enabled: false })).toBe(false)
    })

    it('treats nonsense idle readings as present rather than away', () => {
        // Better to show a break that was not needed than to silently stop
        // showing them because a platform reported something odd.
        expect(isAway(Number.NaN, policy)).toBe(false)
        expect(isAway(-1, policy)).toBe(false)
    })
})

describe('shouldDeferBreak', () => {
    it('holds a break back only while the user is away', () => {
        expect(shouldDeferBreak(10 * MINUTE, policy)).toBe(true)
        expect(shouldDeferBreak(10 * SECOND, policy)).toBe(false)
    })
})

describe('idleCountsAsBreak', () => {
    it('is true once the time away reaches the break length', () => {
        expect(idleCountsAsBreak(20 * SECOND, 20 * SECOND)).toBe(true)
        expect(idleCountsAsBreak(5 * MINUTE, 20 * SECOND)).toBe(true)
    })

    it('is false for a shorter absence', () => {
        expect(idleCountsAsBreak(10 * SECOND, 20 * SECOND)).toBe(false)
    })

    it('is false for zero or nonsense', () => {
        expect(idleCountsAsBreak(0, 20 * SECOND)).toBe(false)
        expect(idleCountsAsBreak(Number.NaN, 20 * SECOND)).toBe(false)
    })
})
