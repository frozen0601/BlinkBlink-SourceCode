export interface Stats {
    // Current streak
    breakStreakCount: number
    breakStreakDuration: number // in milliseconds
    streakStartTime: number
    // Highest streak
    highestStreakCount: number
    highestStreakDuration: number
    highestStreakStartTime: number
    highestStreakEndTime: number
}

export interface Settings {
    startOnBoot: boolean
    enableAnimations: boolean
    language: string
    enableAutoDismiss: boolean
    dashboardDuration: number  // in milliseconds
}

export interface StoreSchema {
    stats: Stats
    lastBreakEndTime: number
    currentWorkStreakStartTime: number
    settings?: Settings
}
