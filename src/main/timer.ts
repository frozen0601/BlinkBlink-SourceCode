import { ipcMain } from 'electron'
import { DURATIONS } from './constants'
import { closeAllWindows } from './windows'

class TimerManager {
    private static instance: TimerManager
    #currentTimer?: NodeJS.Timeout
    #nextBreakTime?: Date
    #skipUntil?: Date

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
    }

    // Timer calculations
    private setNextBreakTime(date: Date): void {
        this.#nextBreakTime = date
        const timeoutDuration = date.getTime() - Date.now()

        this.clearTimer()
        this.#currentTimer = setTimeout(async () => {
            try {
                ipcMain.emit('start-break-countdown')
            } catch (error) {
                console.error('Error during break countdown:', error)
            }
        }, timeoutDuration)
    }

    private getRemainingTimeInMinutes(): number {
        if (!this.#nextBreakTime) return 0
        return Math.max(0, (this.#nextBreakTime.getTime() - Date.now()) / (60 * 1000))
    }

    // Public timer operations
    startWorkTimer(): void {
        if (this.#skipUntil && this.#skipUntil > new Date()) {
            return
        }

        const nextBreak = new Date(Date.now() + DURATIONS.WORK_DURATION)
        this.setNextBreakTime(nextBreak)
    }

    skipBreaksFor(minutes: number): void {
        const nextBreak = new Date(Date.now() + minutes * 60 * 1000)
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

    getTimeUntilNextBreak(): string {
        if (!this.#nextBreakTime) return 'Break timer not running'

        const minutes = this.getRemainingTimeInMinutes()
        if (minutes <= 0) return 'Break time!'

        const hours = Math.floor(minutes / 60)
        const mins = Math.floor(minutes % 60)

        return hours > 0 ? `Next break in ${hours}h ${mins}m` : `Next break in ${mins}m`
    }
}

// Export singleton interface
const timerManager = TimerManager.getInstance()
export const startWorkTimer = () => timerManager.startWorkTimer()
export const clearTimer = () => timerManager.clearTimer()
export const isRunning = () => timerManager.isRunning()
export const skipBreaksFor = (minutes: number) => timerManager.skipBreaksFor(minutes)
export const skipBreaksUntilEndOfDay = () => timerManager.skipBreaksUntilEndOfDay()
export const getTimeUntilNextBreak = () => timerManager.getTimeUntilNextBreak()
