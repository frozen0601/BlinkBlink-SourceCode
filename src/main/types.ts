import { AppStatus } from './state'

export interface TimerOptions {
    duration: number
    onComplete: () => void
}

export interface StatusChangeEvent {
    old: AppStatus
    new: AppStatus
}

export interface StreakStats {
    current: number
    highest: number
    lastUpdated: Date
}