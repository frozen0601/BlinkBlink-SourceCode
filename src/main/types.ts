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
    startOnBoot: boolean
    enableAutoDismiss: boolean
    summaryDuration: number
    enableBreakNotification: boolean
    breakPreNotificationOffset: number
    language: string
    scheduleEnabled: boolean // Master toggle for schedule feature
    schedule: WeeklySchedule
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
    lastBreakEndTime: number // Timestamp of last break
    currentWorkStreakStartTime: number // Current work session start
    stats: Stats // Break/work streak statistics
    settings?: Settings // User preferences
    trayWindowPositions: {
        // UI state persistence
        [trayWindowName: string]: TrayWindowPosition
    }
}
