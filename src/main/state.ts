
import Store from 'electron-store'
import { StoreSchema } from './storeTypes'
import { eventBus, AppEvents } from './events'

class AppState {
  private store: Store<StoreSchema>
  private currentState: {
    isBreakActive: boolean
    isDashboardVisible: boolean
    currentStreak: number
  }

  constructor(store: Store<StoreSchema>) {
    this.store = store
    this.currentState = {
      isBreakActive: false,
      isDashboardVisible: false,
      currentStreak: store.get('stats').breakStreakCount
    }

    this.setupEventListeners()
  }

  private setupEventListeners() {
    eventBus.on(AppEvents.BREAK_START, () => {
      this.currentState.isBreakActive = true
    })

    eventBus.on(AppEvents.BREAK_COMPLETE, () => {
      this.currentState.isBreakActive = false
      this.currentState.currentStreak++
      this.updateStats()
    })
  }

  private updateStats() {
    const stats = this.store.get('stats')
    this.store.set('stats', {
      ...stats,
      breakStreakCount: this.currentState.currentStreak
    })
  }

  public getState() {
    return { ...this.currentState }
  }
}

export const appState = new AppState(new Store<StoreSchema>())