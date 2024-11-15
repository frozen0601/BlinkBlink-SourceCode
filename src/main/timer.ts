import { ipcMain } from 'electron'
import { DURATIONS } from './constants'
import { closeAllWindows } from './windows'
import { updateBreakStats } from './main'

class TimerManager {
    private static instance: TimerManager
    private currentTimer?: NodeJS.Timeout
    private skipUntil?: Date
    private isTimerRunning = false

    private constructor() {}

    static getInstance(): TimerManager {
        if (!TimerManager.instance) {
            TimerManager.instance = new TimerManager()
        }
        return TimerManager.instance
    }

    clearTimer() {
        if (this.currentTimer) {
            clearTimeout(this.currentTimer)
            this.currentTimer = undefined
        }
        this.isTimerRunning = false
    }

    startWorkTimer() {
        if (this.skipUntil && this.skipUntil > new Date()) {
            return
        }

        this.clearTimer()

        this.currentTimer = setTimeout(() => {
            ipcMain.emit('start-break-countdown')
        }, DURATIONS.WORK_DURATION)
        this.isTimerRunning = true
    }

    skipBreaksFor(minutes: number) {
        this.skipUntil = new Date(Date.now() + minutes * 60 * 1000)
        updateBreakStats(true)
        this.startWorkTimer()
        closeAllWindows()
    }

    skipBreaksUntilEndOfDay() {
        const endOfDay = new Date()
        endOfDay.setHours(23, 59, 59, 999)
        this.skipUntil = endOfDay
        updateBreakStats(true)
        this.startWorkTimer()
        closeAllWindows()
    }

    isRunning() {
        return this.isTimerRunning
    }
}

// Export singleton methods
const timerManager = TimerManager.getInstance()
export const startWorkTimer = () => timerManager.startWorkTimer()
export const clearTimer = () => timerManager.clearTimer()
export const isRunning = () => timerManager.isRunning()
export const skipBreaksFor = (minutes: number) => timerManager.skipBreaksFor(minutes)
export const skipBreaksUntilEndOfDay = () => timerManager.skipBreaksUntilEndOfDay()
