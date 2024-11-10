export interface Stats {
    breakStreakCount: number
    breakStreakDuration: number
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
