// src/store.ts

import Store from 'electron-store'
import { StoreSchema } from './storeTypes'

export const store = new Store<StoreSchema>({
    defaults: {
        stats: {
            totalWorkTimeToday: 0,
            totalBreakTimeToday: 0,
            breaksTakenToday: 0,
            longestWorkStreak: 0,
        },
        lastBreakEndTime: Date.now(),
        currentWorkStreakStartTime: Date.now(),
        settings: {
            startOnBoot: false,
            enableAnimations: true,
            language: 'en',
        },
    },
})
