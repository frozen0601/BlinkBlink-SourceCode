// src/timer.ts

import { store } from './store'
import { ipcMain } from 'electron'

let workTimer: NodeJS.Timeout
let breakTimer: NodeJS.Timeout | null = null
let isTimerRunning = false

enum TimerState {
    Work,
    BreakCountdown,
    Dashboard,
}

let currentState: TimerState = TimerState.Work

export function startWorkTimer() {
    if (isTimerRunning) {
        return
    }

    isTimerRunning = true
    currentState = TimerState.Work

    const now = Date.now()
    const lastBreakEndTime = store.get('lastBreakEndTime') as number
    const currentStreak = now - lastBreakEndTime

    if (currentStreak > store.get('stats').longestWorkStreak) {
        store.set('stats.longestWorkStreak', currentStreak)
    }

    store.set('currentWorkStreakStartTime', now)

    console.log('Starting work timer')
    workTimer = setTimeout(() => {
        currentState = TimerState.BreakCountdown
        ipcMain.emit('start-break-countdown')
    }, 20 * 60 * 1000) // 20 minutes

    // For testing purposes, you can use shorter durations:
    workTimer = setTimeout(() => {
        currentState = TimerState.BreakCountdown
        ipcMain.emit('start-break-countdown')
    }, 1 * 1000) // 10 seconds
}

export function skipBreak() {
    if (currentState === TimerState.BreakCountdown) {
        clearTimeout(breakTimer!)
        isTimerRunning = false
        currentState = TimerState.Work
    }
}

export function completeBreak() {
    if (currentState === TimerState.BreakCountdown) {
        clearTimeout(breakTimer!)
        isTimerRunning = false
        currentState = TimerState.Dashboard
    }
}

export function dismissDashboard() {
    if (currentState === TimerState.Dashboard) {
        isTimerRunning = false
        currentState = TimerState.Work
    }
}

export function pauseTimer() {
    clearTimeout(workTimer)
    clearTimeout(breakTimer!)
    isTimerRunning = false
    currentState = TimerState.Work
}

export function skipBreaks(minutes: number) {
    clearTimeout(workTimer)
    clearTimeout(breakTimer!)
    isTimerRunning = false
    currentState = TimerState.Work

    setTimeout(startWorkTimer, minutes * 60 * 1000)
}

export function skipBreaksUntilEndOfDay() {
    clearTimeout(workTimer)
    clearTimeout(breakTimer!)
    isTimerRunning = false
    currentState = TimerState.Work

    const now = new Date()
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)
    const millisUntilEOD = endOfDay.getTime() - now.getTime()

    setTimeout(startWorkTimer, millisUntilEOD)
}
