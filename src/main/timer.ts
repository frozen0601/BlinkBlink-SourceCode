/**
 * The break timer.
 *
 * All the decisions live in `core/timer-plan`; this file only arms real
 * `setTimeout`s against them, re-planning whenever the world changes: settings
 * are saved, the machine wakes up, a skip expires, or the wall clock moves
 * without time having passed.
 */

import { powerMonitor } from 'electron'
import { appEvents } from './events'
import { getSettings } from './store'
import { clampDelay, clockJumped, planNextBreak, planReminder, TimerPlan } from '../core/timer-plan'
import { shouldDeferBreak } from '../core/idle'

/** How often the watchdog checks that the armed timer still makes sense. */
const WATCHDOG_INTERVAL_MS = 30_000

/** How often to look for the user coming back, while a break is held. */
const RETURN_POLL_MS = 5_000

/** Firing within this margin of the target counts as "on time". */
const FIRE_TOLERANCE_MS = 500

export type TimerMode = 'break' | 'wait' | 'idle' | 'deferred'

export interface TimerStatus {
    mode: TimerMode
    /** When the next break is due, when `mode` is `break`. */
    nextBreakAt: Date | null
    /** When the timer will next re-plan, when `mode` is `wait`. */
    resumesAt: Date | null
    /** Active skip, if any. */
    skipUntil: Date | null
    /** True while a due break is being held back until the user returns. */
    awaitingReturn: boolean
}

class TimerManager {
    #mainTimer?: NodeJS.Timeout
    #reminderTimer?: NodeJS.Timeout
    #watchdog?: NodeJS.Timeout

    #mode: TimerMode = 'idle'
    #nextBreakAt: Date | null = null
    #resumesAt: Date | null = null
    #skipUntil: Date | null = null
    #returnPoll?: NodeJS.Timeout

    /** Wall clock reading at the last watchdog tick, for jump detection. */
    #lastWatchdogAt = Date.now()

    // Lifecycle ---------------------------------------------------------

    start(): void {
        this.plan()
        this.#startWatchdog()
    }

    stop(): void {
        this.#clearTimers()
        if (this.#watchdog) {
            clearInterval(this.#watchdog)
            this.#watchdog = undefined
        }
        this.#mode = 'idle'
        this.#nextBreakAt = null
        this.#resumesAt = null
    }

    // Queries -----------------------------------------------------------

    isRunning(): boolean {
        return this.#mode === 'break' && this.#nextBreakAt !== null
    }

    getStatus(): TimerStatus {
        return {
            mode: this.#mode,
            nextBreakAt: this.#nextBreakAt,
            resumesAt: this.#resumesAt,
            skipUntil: this.#skipUntil,
            awaitingReturn: this.#returnPoll !== undefined,
        }
    }

    getRemainingTimeInMinutes(): number {
        if (!this.#nextBreakAt || this.#mode !== 'break') return 0
        const remaining = (this.#nextBreakAt.getTime() - Date.now()) / 60_000
        return Math.ceil(Math.max(0, remaining))
    }

    isSkipping(): boolean {
        return this.#skipUntil !== null && this.#skipUntil.getTime() > Date.now()
    }

    // Commands ----------------------------------------------------------

    /** Recomputes the plan from current settings and re-arms accordingly. */
    plan(): void {
        this.#clearTimers()

        const settings = getSettings()
        const now = new Date()

        if (this.#skipUntil && this.#skipUntil.getTime() <= now.getTime()) {
            this.#skipUntil = null
        }

        const plan = planNextBreak({
            now,
            workDuration: settings.workDuration,
            scheduleEnabled: settings.scheduleEnabled,
            schedule: settings.schedule,
            skipUntil: this.#skipUntil,
        })

        this.#apply(plan, settings.enableBreakNotification ? settings.breakPreNotificationOffset : 0, now)
        appEvents.emit('timer-changed')
    }

    /** Suppresses breaks for `minutes`, then resumes the normal cycle. */
    skipBreaksFor(minutes: number): void {
        this.#skipUntil = new Date(Date.now() + Math.max(1, minutes) * 60_000)
        this.plan()
    }

    /**
     * Suppresses breaks until local midnight.
     *
     * The timer stays armed for the boundary and re-plans there, so the app
     * comes back by itself the next day instead of staying dead until restart.
     */
    skipBreaksUntilEndOfDay(): void {
        const endOfDay = new Date()
        endOfDay.setHours(23, 59, 59, 999)
        this.#skipUntil = endOfDay
        this.plan()
    }

    /** Cancels an active skip. */
    resumeBreaks(): void {
        this.#skipUntil = null
        this.plan()
    }

    isSkippedUntilEndOfDay(): boolean {
        if (!this.#skipUntil) return false
        const endOfDay = new Date()
        endOfDay.setHours(23, 59, 59, 999)
        return Math.abs(this.#skipUntil.getTime() - endOfDay.getTime()) < 1000
    }

    // Internals ---------------------------------------------------------

    #clearTimers(): void {
        if (this.#returnPoll) {
            clearInterval(this.#returnPoll)
            this.#returnPoll = undefined
        }
        if (this.#mainTimer) {
            clearTimeout(this.#mainTimer)
            this.#mainTimer = undefined
        }
        if (this.#reminderTimer) {
            clearTimeout(this.#reminderTimer)
            this.#reminderTimer = undefined
        }
    }

    #apply(plan: TimerPlan, reminderOffset: number, now: Date): void {
        this.#mode = plan.kind

        if (plan.kind === 'idle') {
            this.#nextBreakAt = null
            this.#resumesAt = null
            return
        }

        if (plan.kind === 'wait') {
            this.#nextBreakAt = null
            this.#resumesAt = plan.until
            this.#armAt(plan.until, () => this.plan())
            return
        }

        this.#nextBreakAt = plan.at
        this.#resumesAt = null
        this.#armAt(plan.at, () => this.#fireBreak())

        const reminderAt = planReminder(plan.at, reminderOffset, now)
        if (reminderAt) {
            const breakAt = plan.at
            this.#reminderTimer = setTimeout(
                () => {
                    this.#reminderTimer = undefined
                    appEvents.emit('reminder-due', { breakAt })
                },
                clampDelay(reminderAt.getTime() - now.getTime())
            )
        }
    }

    /**
     * Arms `action` for `target`.
     *
     * `setTimeout` cannot represent delays beyond ~24 days, so a long wait is
     * armed in clamped hops that re-check the target when they fire.
     */
    #armAt(target: Date, action: () => void): void {
        const schedule = () => {
            const delay = target.getTime() - Date.now()
            this.#mainTimer = setTimeout(() => {
                this.#mainTimer = undefined
                if (Date.now() < target.getTime() - FIRE_TOLERANCE_MS) {
                    schedule() // Clamped hop; keep going.
                    return
                }
                action()
            }, clampDelay(delay))
        }

        schedule()
    }

    #fireBreak(): void {
        this.#skipUntil = null

        // A break shown to an empty chair is missed, and worse, it starts the
        // next work interval from the wrong moment so the following break
        // arrives too early. Hold it until the user comes back.
        if (shouldDeferBreak(this.#idleMs(), this.#idlePolicy())) {
            console.info('[timer] user is away; holding the break until they return')
            this.#mode = 'deferred'
            this.#nextBreakAt = null
            this.#waitForReturn()
            appEvents.emit('timer-changed')
            return
        }

        appEvents.emit('break-due')
    }

    #idlePolicy() {
        const settings = getSettings()
        return { enabled: settings.skipBreakWhenIdle, thresholdMs: settings.idleThreshold }
    }

    /** Seconds since the last input, in milliseconds. */
    #idleMs(): number {
        try {
            return powerMonitor.getSystemIdleTime() * 1000
        } catch (error) {
            // Not every Linux session exposes an idle time; assume present.
            console.warn('[timer] could not read the system idle time:', error)
            return 0
        }
    }

    /**
     * Polls until the user is back, then starts a fresh work interval.
     *
     * Time away is not credited to the break streak: that counts breaks
     * actually taken with the app, and awarding one for walking away would
     * make the number meaningless.
     */
    #waitForReturn(): void {
        if (this.#returnPoll) clearInterval(this.#returnPoll)

        this.#returnPoll = setInterval(() => {
            if (shouldDeferBreak(this.#idleMs(), this.#idlePolicy())) return

            console.info('[timer] user is back; starting a fresh work interval')
            clearInterval(this.#returnPoll)
            this.#returnPoll = undefined
            this.plan()
        }, RETURN_POLL_MS)

        this.#returnPoll.unref?.()
    }

    /**
     * Catches the cases a plain `setTimeout` cannot.
     *
     * A suspended laptop, a resumed VM or a user correcting the clock all leave
     * an armed timer pointing at the wrong instant. `powerMonitor` covers the
     * common suspend/resume path, but not every environment emits it — notably
     * a good many Linux desktops — so this compares elapsed wall-clock time
     * against elapsed interval time and re-plans when they disagree.
     */
    #startWatchdog(): void {
        if (this.#watchdog) clearInterval(this.#watchdog)
        this.#lastWatchdogAt = Date.now()

        this.#watchdog = setInterval(() => {
            const now = Date.now()
            const elapsed = now - this.#lastWatchdogAt
            this.#lastWatchdogAt = now

            if (clockJumped(WATCHDOG_INTERVAL_MS, elapsed)) {
                console.info('[timer] clock jump detected, re-planning')
                this.plan()
                return
            }

            // An overdue target means the timeout never fired (a suspended
            // process, typically). Re-plan rather than waiting indefinitely.
            const target = this.#mode === 'break' ? this.#nextBreakAt : this.#resumesAt
            if (target && now > target.getTime() + WATCHDOG_INTERVAL_MS) {
                console.info('[timer] armed timer is overdue, re-planning')
                this.plan()
            }
        }, WATCHDOG_INTERVAL_MS)

        // A watchdog interval should never hold the process open on its own.
        this.#watchdog.unref?.()
    }
}

const timerManager = new TimerManager()

export const startWorkTimer = () => timerManager.plan()
export const startTimer = () => timerManager.start()
export const stopTimer = () => timerManager.stop()
export const clearTimer = () => timerManager.stop()
export const isRunning = () => timerManager.isRunning()
export const getTimerStatus = () => timerManager.getStatus()
export const skipBreaksFor = (minutes: number) => timerManager.skipBreaksFor(minutes)
export const skipBreaksUntilEndOfDay = () => timerManager.skipBreaksUntilEndOfDay()
export const resumeBreaks = () => timerManager.resumeBreaks()
export const getRemainingTimeInMinutes = () => timerManager.getRemainingTimeInMinutes()
export const isSkippedUntilEndOfDay = () => timerManager.isSkippedUntilEndOfDay()
export const isSkipping = () => timerManager.isSkipping()
