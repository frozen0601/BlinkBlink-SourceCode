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
    language: string
}

export interface TrayWindowPosition {
    x: number
    y: number
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
