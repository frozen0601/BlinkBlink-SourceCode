import { autoUpdater } from 'electron-updater'
import { BrowserWindow, Notification, ipcMain } from 'electron'

export function initializeAutoUpdater(mainWindow: BrowserWindow) {
    if (!mainWindow) return

    // Automatically check for updates on startup
    autoUpdater.checkForUpdatesAndNotify()

    // Listen for 'update-downloaded' event
    autoUpdater.on('update-downloaded', () => {
        // new Notification({
        //     title: 'Update Ready',
        //     body: 'A new update has been downloaded. Restart the application to apply the updates.',
        // }).show()

        // Notify renderer process that update is ready
        mainWindow.webContents.send('update-downloaded')
    })

    // Handle any errors during the update process
    autoUpdater.on('error', (error) => {
        console.error('AutoUpdater error:', error)
        new Notification({
            title: 'Update Error',
            body: `Failed to update the application: ${error == null ? 'unknown' : (error.stack || error).toString()}`,
        }).show()
    })

    // IPC handler to manually check for updates
    ipcMain.on('check-for-updates', () => {
        autoUpdater.checkForUpdates()
    })

    // IPC handler to restart and install updates
    ipcMain.on('restart-and-install', () => {
        autoUpdater.quitAndInstall()
    })
}
