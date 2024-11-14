import { store } from './store'
import { ipcMain } from 'electron'
import { DURATIONS } from './constants'

enum TimerState {
    Work,
    BreakCountdown,
    Dashboard,
}

class TimerManager {
    private static instance: TimerManager
    private workTimer!: NodeJS.Timeout  // Add ! to tell TypeScript this will be assigned
    private isTimerRunning = false
    private currentState: TimerState = TimerState.Work

    private constructor() {}

    static getInstance(): TimerManager {
        if (!TimerManager.instance) {
            TimerManager.instance = new TimerManager()
        }
        return TimerManager.instance
    }

    private clearTimers() {
        if (this.workTimer) {
            clearTimeout(this.workTimer)
        }
        this.isTimerRunning = false
    }

    private scheduleNextWorkTimer(delayInMinutes: number) {
        this.clearTimers()
        setTimeout(() => this.startWorkTimer(), delayInMinutes * 60 * 1000)
    }

    startWorkTimer() {
        this.clearTimers()
        this.isTimerRunning = true
        this.currentState = TimerState.Work

        this.workTimer = setTimeout(() => {
            this.currentState = TimerState.BreakCountdown
            ipcMain.emit('start-break-countdown')
        }, DURATIONS.WORK_DURATION)
    }

    skipBreak() {
        if (this.currentState !== TimerState.BreakCountdown) return
        this.clearTimers()
        this.currentState = TimerState.Work
    }

    completeBreak() {
        if (this.currentState !== TimerState.BreakCountdown) return
        this.clearTimers()
        this.currentState = TimerState.Dashboard
        this.isTimerRunning = false
    }

    dismissDashboard() {
        if (this.currentState !== TimerState.Dashboard) return
        this.currentState = TimerState.Work
    }

    pauseTimer() {
        this.clearTimers()
        this.currentState = TimerState.Work
    }

    skipBreaks(minutes: number) {
        this.currentState = TimerState.Work
        this.scheduleNextWorkTimer(minutes)
    }

    skipBreaksUntilEndOfDay() {
        this.currentState = TimerState.Work
        this.clearTimers()

        const now = new Date()
        const endOfDay = new Date()
        endOfDay.setHours(23, 59, 59, 999)
        const millisUntilEOD = endOfDay.getTime() - now.getTime()
        const minutesUntilEOD = millisUntilEOD / (60 * 1000)

        this.scheduleNextWorkTimer(minutesUntilEOD)
    }

    getCurrentState() {
        return this.currentState
    }

    isRunning() {
        return this.isTimerRunning
    }
}

const timerManager = TimerManager.getInstance()

export const startWorkTimer = () => timerManager.startWorkTimer()
export const skipBreak = () => timerManager.skipBreak()
export const completeBreak = () => timerManager.completeBreak()
export const dismissDashboard = () => timerManager.dismissDashboard()
export const pauseTimer = () => timerManager.pauseTimer()
export const skipBreaks = (minutes: number) => timerManager.skipBreaks(minutes)
export const skipBreaksUntilEndOfDay = () => timerManager.skipBreaksUntilEndOfDay()
export const getCurrentState = () => timerManager.getCurrentState()
export const isRunning = () => timerManager.isRunning()
