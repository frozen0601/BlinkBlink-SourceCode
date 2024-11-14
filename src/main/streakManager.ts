
import Store from 'electron-store'
import { StoreSchema } from './storeTypes'

export class StreakManager {
    constructor(private store: Store<StoreSchema>) {}

    increment() {
        const stats = this.store.get('stats')
        const newStreak = stats.breakStreakCount + 1
        this.updateStats(newStreak)
    }

    reset() {
        this.updateStats(0)
    }

    private updateStats(count: number) {
        const stats = this.store.get('stats')
        this.store.set('stats', {
            ...stats,
            breakStreakCount: count,
        })
    }
}