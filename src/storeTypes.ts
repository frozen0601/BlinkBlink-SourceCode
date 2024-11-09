export interface Stats {
    totalWorkTimeToday: number
    eyeProtectionTime: number
    breaksTakenToday: number
    longestWorkStreak: number
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
