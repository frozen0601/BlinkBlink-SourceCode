import { EventEmitter } from 'events'
import { ipcMain } from 'electron'

// Define event types for better type safety
export enum AppEvents {
    BREAK_START = 'break-start',
    BREAK_SKIP = 'break-skip',
    BREAK_COMPLETE = 'break-complete',
    DASHBOARD_SHOW = 'dashboard-show',
    DASHBOARD_DISMISS = 'dashboard-dismiss',
    TIMER_START = 'timer-start',
    TIMER_PAUSE = 'timer-pause',
}

class AppEventBus extends EventEmitter {
    constructor() {
        super()
        this.setupIpcHandlers()
    }

    private setupIpcHandlers() {
        // Map IPC events to internal event bus
        ipcMain.on('break-skip', () => this.emit(AppEvents.BREAK_SKIP))
        ipcMain.on('break-complete', () => this.emit(AppEvents.BREAK_COMPLETE))
        ipcMain.on('dashboard-dismissed', () => this.emit(AppEvents.DASHBOARD_DISMISS))
    }
}

export const eventBus = new AppEventBus()
