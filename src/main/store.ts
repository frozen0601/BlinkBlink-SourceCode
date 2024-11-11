// src/store.ts

import Store from 'electron-store'
import { StoreSchema } from './storeTypes'

export const store = new Store<StoreSchema>({
    defaults: {
        stats: {
            breakStreakCount: 0,
            breakStreakDuration: 0,
            streakStartTime: Date.now(),
            highestStreakCount: 0,
            highestStreakDuration: 0,
            highestStreakStartTime: Date.now(),
            highestStreakEndTime: Date.now(),
        },
        lastBreakEndTime: Date.now(),
        currentWorkStreakStartTime: Date.now(),
        settings: {
            startOnBoot: false,
            enableAnimations: true,
            language: 'en',
            enableAutoDismiss: true,
            dashboardDuration: 5000,
        },
    },
})
