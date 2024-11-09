export interface Stats {
    breakStreakCount: number
    breakStreakDuration: number
}

export interface Settings {
    startOnBoot: boolean
    enableAnimations: boolean
    language: string
}

export interface StoreSchema {
    stats: Stats
    lastBreakEndTime: number
    currentWorkStreakStartTime: number
    settings?: Settings
}
