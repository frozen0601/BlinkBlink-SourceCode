// src/store.ts

import Store from 'electron-store'
import { StoreSchema } from './storeTypes'

export const STORE_DEFAULTS: StoreSchema = {
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
        language: 'en',
        enableAutoDismiss: true,
        summaryDuration: 5000,
    },
}

export const store = new Store<StoreSchema>({
    defaults: STORE_DEFAULTS,
})
