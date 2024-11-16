import { ipcMain, Notification } from 'electron'
import { DURATIONS } from './constants'
import { closeAllWindows } from './windows'
import { getSettings } from './store'

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
                this.skipBreaksFor(Math.floor(DURATIONS.WORK_DURATION / (60 * 1000)))
                notification.close()
            })

            notification.show()
        }, notificationTime - now)
    }

    private setNextBreakTime(date: Date): void {
        this.#nextBreakTime = date
        const timeoutDuration = date.getTime() - Date.now()

        this.clearTimer()
        this.scheduleBreakNotification(date)

        this.#currentTimer = setTimeout(async () => {
            try {
                ipcMain.emit('start-break-countdown')
            } catch (error) {
                console.error('Error during break countdown:', error)
            }
        }, timeoutDuration)
    }

    getRemainingTimeInMinutes(): number {
        if (!this.#nextBreakTime) return 0
        const remaining = (this.#nextBreakTime.getTime() - Date.now()) / (60 * 1000)
        return Math.ceil(Math.max(0, remaining))
    }

    // Public timer operations
    startWorkTimer(): void {
        // Only honor skip if more than 20 minutes remaining
        if (this.#skipUntil && this.#skipUntil > new Date() && this.#skipUntil.getTime() - Date.now() > 20 * 60 * 1000) {
            this.setNextBreakTime(this.#skipUntil)
            return
        }

        this.#skipUntil = undefined
        const nextBreak = new Date(Date.now() + DURATIONS.WORK_DURATION)
        this.setNextBreakTime(nextBreak)
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
        this.setNextBreakTime(endOfDay)
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
