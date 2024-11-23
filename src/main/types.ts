// Individual feature interfaces
export interface Stats {
    breakStreakCount: number
    breakStreakDuration: number
    streakStartTime: number
    highestStreakCount: number
    highestStreakDuration: number
    highestStreakStartTime: number
    highestStreakEndTime: number
}

export interface Settings {
    enableBreakNotification: boolean
    enableSoundNotification: boolean
    notificationSound: string
    breakPreNotificationOffset: number
    enableAutoDismiss: boolean
    summaryDuration: number
    scheduleEnabled: boolean
    schedule: WeeklySchedule
    startOnBoot: boolean
    autoUpdate: boolean
    language: string
}

export interface TrayWindowPosition {
    x: number
    y: number
}

export interface TimeRange {
    start: string // 24-hour format "HH:mm"
    end: string // 24-hour format "HH:mm"
}

export interface DaySchedule {
    enabled: boolean
    timeRanges: TimeRange[]
}

export interface WeeklySchedule {
    monday: DaySchedule
    tuesday: DaySchedule
    wednesday: DaySchedule
    thursday: DaySchedule
    friday: DaySchedule
    saturday: DaySchedule
    sunday: DaySchedule
}

// Root schema that defines the complete structure of our persistent storage
// This ensures type safety when reading/writing to electron-store
export interface StoreSchema {
    userId: string // Unique user ID
    settings?: Settings // User preferences
    stats: Stats // Break/work streak statistics
    hasCompletedFirstRun: boolean // First run flag
    lastBreakEndTime: number // Timestamp of last break
    currentWorkStreakStartTime: number // Current work session start
    trayWindowPositions: {
        // UI state persistence
        [trayWindowName: string]: TrayWindowPosition
    }
}
