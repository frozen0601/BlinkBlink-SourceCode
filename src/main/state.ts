import Store from 'electron-store'
import { StoreSchema } from './storeTypes'

export enum AppStatus {
    Idle = 'idle',
    Working = 'working',
    Breaking = 'breaking',
    Dashboard = 'dashboard',
}

class AppState {
    private store: Store<StoreSchema>
    private status: AppStatus = AppStatus.Idle
    private breakStreak: number

    constructor(store: Store<StoreSchema>) {
        this.store = store
        this.breakStreak = store.get('stats').breakStreakCount
    }

    public getStatus(): AppStatus {
        return this.status
    }

    public setStatus(newStatus: AppStatus) {
        this.status = newStatus
        if (newStatus === AppStatus.Dashboard) {
            this.incrementStreak()
        }
    }

    private incrementStreak() {
        this.breakStreak++
        const stats = this.store.get('stats')
        this.store.set('stats', {
            ...stats,
            breakStreakCount: this.breakStreak,
        })
    }

    public resetStreak() {
        this.breakStreak = 0
        const stats = this.store.get('stats')
        this.store.set('stats', {
            ...stats,
            breakStreakCount: 0,
        })
    }

    public getStats() {
        return this.store.get('stats')
    }
}

export const appState = new AppState(new Store<StoreSchema>())
