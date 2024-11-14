import { ipcMain } from 'electron'
import { DURATIONS } from './constants'
import { appState, AppStatus } from './state'

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

    private clearTimer() {
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
        appState.setStatus(AppStatus.Working)

        this.currentTimer = setTimeout(() => {
            appState.setStatus(AppStatus.Breaking)
            ipcMain.emit('start-break-countdown')
        }, DURATIONS.WORK_DURATION)
        this.isTimerRunning = true
    }

    skipBreaksFor(minutes: number) {
        this.skipUntil = new Date(Date.now() + minutes * 60 * 1000)
        appState.resetStreak()
        this.startWorkTimer()
    }

    skipBreaksUntilEndOfDay() {
        const endOfDay = new Date()
        endOfDay.setHours(23, 59, 59, 999)
        this.skipUntil = endOfDay
        appState.resetStreak()
        this.startWorkTimer()
    }

    skipBreak() {
        if (this.skipUntil && this.skipUntil > new Date()) {
            return
        }
        this.clearTimer()
        appState.setStatus(AppStatus.Working)
        this.startWorkTimer()
    }

    completeBreak() {
        this.clearTimer()
        appState.setStatus(AppStatus.Dashboard)
    }

    dismissDashboard() {
        appState.setStatus(AppStatus.Working)
        this.startWorkTimer()
    }

    pause() {
        this.clearTimer()
        appState.setStatus(AppStatus.Idle)
    }

    isRunning() {
        return this.isTimerRunning
    }
}

// Export singleton methods
const timerManager = TimerManager.getInstance()
export const startWorkTimer = () => timerManager.startWorkTimer()
export const skipBreak = () => timerManager.skipBreak()
export const skipBreaksFor = (minutes: number) => timerManager.skipBreaksFor(minutes)
export const skipBreaks = skipBreaksFor // Alias for backward compatibility
export const skipBreaksUntilEndOfDay = () => timerManager.skipBreaksUntilEndOfDay()
export const completeBreak = () => timerManager.completeBreak()
export const dismissDashboard = () => timerManager.dismissDashboard()
export const pauseTimer = () => timerManager.pause() // Alias for backward compatibility
export const isRunning = () => timerManager.isRunning()
