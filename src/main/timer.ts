import { ipcMain, Notification } from 'electron'
import { closeAllWindows } from './windows'
import { getSettings, getWorkDuration } from './store'
import { scheduleManager } from './scheduler'

class TimerManager {
    private static instance: TimerManager
    #currentTimer?: NodeJS.Timeout
    #nextBreakTime?: Date
    #skipUntil?: Date
    #notificationTimer?: NodeJS.Timeout

    private constructor() {}

    static getInstance(): TimerManager {
        if (!TimerManager.instance) {
            TimerManager.instance = new TimerManager()
        }
        return TimerManager.instance
    }

    // Timer state management
    isRunning(): boolean {
        return !!this.#currentTimer
    }

    clearTimer(): void {
        if (this.#currentTimer) {
            clearTimeout(this.#currentTimer)
            this.#currentTimer = undefined
        }
        if (this.#notificationTimer) {
            clearTimeout(this.#notificationTimer)
            this.#notificationTimer = undefined
        }
    }

    // Timer calculations
    private scheduleBreakNotification(breakTime: Date): void {
        const settings = getSettings()
        if (!settings.enableBreakNotification) return

        const now = Date.now()
        const breakTimeMs = breakTime.getTime()
        const notificationTime = breakTimeMs - settings.breakPreNotificationOffset

        // Don't schedule if break is too soon or already passed
        if (notificationTime <= now) return

        this.#notificationTimer = setTimeout(() => {
            const notification = new Notification({
                title: 'Break Reminder',
                body: `Your break is starting in ${Math.round(settings.breakPreNotificationOffset / 1000)} seconds`,
                actions: [{ type: 'button', text: 'Skip this break' }],
            })

            notification.on('action', () => {
                this.skipBreaksFor(Math.floor(getWorkDuration() / (60 * 1000)))
                notification.close()
            })

            notification.show()
        }, notificationTime - now)
    }

    private setNextBreakTime(date: Date): void {
        // Don't set a break if it's equal to or after the current range end time
        const currentRangeEnd = scheduleManager.getCurrentRangeEnd(new Date())
        if (currentRangeEnd && date >= currentRangeEnd) {
            this.clearTimer()
            return
        }

        this.#nextBreakTime = date
        const timeoutDuration = date.getTime() - Date.now()

        this.clearTimer()
        this.scheduleBreakNotification(date)

        // Only set timer if it's within today's schedule
        if (scheduleManager.isWithinActiveHours(date)) {
            this.#currentTimer = setTimeout(async () => {
                try {
                    ipcMain.emit('start-break-countdown')
                } catch (error) {
                    console.error('Error during break countdown:', error)
                }
            }, timeoutDuration)
        }
    }

    private shouldSetTimer(date: Date): boolean {
        const currentRangeEnd = scheduleManager.getCurrentRangeEnd(date)
        return !currentRangeEnd || date < currentRangeEnd
    }

    getRemainingTimeInMinutes(): number {
        if (!this.#nextBreakTime) return 0
        const remaining = (this.#nextBreakTime.getTime() - Date.now()) / (60 * 1000)
        return Math.ceil(Math.max(0, remaining))
    }

    // Public timer operations
    startWorkTimer(): void {
        const now = new Date()

        // 1. Handle schedule restrictions
        if (!scheduleManager.isWithinActiveHours(now)) {
            const nextActive = scheduleManager.getNextActiveTime()
            if (nextActive) {
                this.setNextBreakTime(nextActive)
            } else {
                this.clearTimer()
            }
            return
        }

        // 2. Handle skip conditions
        if (this.#skipUntil && this.#skipUntil > now) {
            if (scheduleManager.isWithinActiveHours(this.#skipUntil)) {
                this.setNextBreakTime(this.#skipUntil)
                return
            }
        }

        // 3. Calculate next break
        const proposedBreak = new Date(now.getTime() + getWorkDuration())
        if (!this.shouldSetTimer(proposedBreak)) {
            const currentRangeEnd = scheduleManager.getCurrentRangeEnd(now)
            if (currentRangeEnd) {
                this.setNextBreakTime(currentRangeEnd)
                return
            }
        }

        // 4. Set normal timer
        this.#skipUntil = undefined
        this.setNextBreakTime(proposedBreak)
    }

    skipBreaksFor(minutes: number): void {
        const nextBreak = new Date(Date.now() + minutes * 60 * 1000)
        this.#skipUntil = nextBreak
        this.setNextBreakTime(nextBreak)
        closeAllWindows()
    }

    skipBreaksUntilEndOfDay(): void {
        const endOfDay = new Date()
        endOfDay.setHours(23, 59, 59, 999)
        this.#skipUntil = endOfDay
        this.clearTimer() // Don't set a timer if skipping
        closeAllWindows()
    }

    isSkippedUntilEndOfDay(): boolean {
        if (!this.#skipUntil) return false
        const now = new Date()
        const endOfDay = new Date()
        endOfDay.setHours(23, 59, 59, 999)
        return this.#skipUntil.getTime() === endOfDay.getTime()
    }
}

// Export singleton interface
const timerManager = TimerManager.getInstance()
export const startWorkTimer = () => timerManager.startWorkTimer()
export const clearTimer = () => timerManager.clearTimer()
export const isRunning = () => timerManager.isRunning()
export const skipBreaksFor = (minutes: number) => timerManager.skipBreaksFor(minutes)
export const skipBreaksUntilEndOfDay = () => timerManager.skipBreaksUntilEndOfDay()
export const getRemainingTimeInMinutes = () => timerManager.getRemainingTimeInMinutes()
export const isSkippedUntilEndOfDay = () => timerManager.isSkippedUntilEndOfDay()
