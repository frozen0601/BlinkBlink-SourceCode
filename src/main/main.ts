import { app } from 'electron'
import 'dotenv/config'
import { initialize } from '@aptabase/electron/main'
import { destroyTray } from './tray'
import { stopAutoUpdateTimer } from './updater'
import { clearTimer } from './timer'
import { closeAllWindows } from './windows'
import { registerIpcHandlers } from './ipcHandlers'
import { setupApp } from './appSetup'

// Initialize Analytics
if (process.env.APTABASE_API_KEY) {
    initialize(process.env.APTABASE_API_KEY)
}

// Register IPC Handlers
registerIpcHandlers()

// App Lifecycle Events
app.whenReady().then(() => {
    setupApp()
})

app.on('window-all-closed', () => {
    // Keep the app running in the tray
})

// Gracefully handle app quitting
app.on('before-quit', () => {
    stopAutoUpdateTimer()
    clearTimer()
    closeAllWindows()
    destroyTray()
})