import { store } from './store'
import { ipcMain } from 'electron'
import { DURATIONS } from './constants'

let workTimer: NodeJS.Timeout
let breakTimer: NodeJS.Timeout | null = null
let isTimerRunning = false

enum TimerState {
    Work,
    BreakCountdown,
    Dashboard,
}

let currentState: TimerState = TimerState.Work

// Timer Control Methods
function clearTimers() {
    clearTimeout(workTimer)
    clearTimeout(breakTimer!)
    isTimerRunning = false
}

function scheduleNextWorkTimer(delayInMinutes: number) {
    clearTimers()
    setTimeout(startWorkTimer, delayInMinutes * 60 * 1000)
}

// Primary Timer Methods
export function startWorkTimer() {
    if (isTimerRunning) return

    isTimerRunning = true
    currentState = TimerState.Work

    const duration = DURATIONS.WORK_DURATION

    workTimer = setTimeout(() => {
        currentState = TimerState.BreakCountdown
        ipcMain.emit('start-break-countdown')
    }, duration)
}

// Break Management Methods
export function skipBreak() {
    if (currentState !== TimerState.BreakCountdown) return
    clearTimers()
    currentState = TimerState.Work
}

export function completeBreak() {
    if (currentState !== TimerState.BreakCountdown) return
    clearTimers()
    currentState = TimerState.Dashboard
}

export function dismissDashboard() {
    if (currentState !== TimerState.Dashboard) return
    isTimerRunning = false
    currentState = TimerState.Work
}

// Timer Control Methods
export function pauseTimer() {
    clearTimers()
    currentState = TimerState.Work
}

export function skipBreaks(minutes: number) {
    currentState = TimerState.Work
    scheduleNextWorkTimer(minutes)
}

export function skipBreaksUntilEndOfDay() {
    currentState = TimerState.Work
    clearTimers()

    const now = new Date()
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)
    const millisUntilEOD = endOfDay.getTime() - now.getTime()
    const minutesUntilEOD = millisUntilEOD / (60 * 1000)

    scheduleNextWorkTimer(minutesUntilEOD)
}

// State Management
export function getCurrentState() {
    return currentState
}

export function isRunning() {
    return isTimerRunning
}
