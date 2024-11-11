// src/updater.ts
import { autoUpdater } from 'electron-updater'
import { BrowserWindow, dialog, ipcMain } from 'electron'

export function initializeAutoUpdater(mainWindow: BrowserWindow) {
    if (!mainWindow) return

    // const isProd = process.env.NODE_ENV === 'production'
    // if (isProd) {
        autoUpdater.checkForUpdatesAndNotify()
    // }

    autoUpdater.on('update-available', () => {
        const result = dialog.showMessageBoxSync(mainWindow, {
            type: 'info',
            buttons: ['Later', 'Download'],
            title: 'Update Available',
            message: 'A new version is available. Do you want to download it now?',
        })
        if (result === 1) {
            // 'Download' button
            autoUpdater.downloadUpdate()
        }
    })

    autoUpdater.on('update-downloaded', () => {
        const result = dialog.showMessageBoxSync(mainWindow, {
            type: 'info',
            buttons: ['Restart Now', 'Later'],
            title: 'Update Ready',
            message: 'A new version has been downloaded. Restart the application to apply the updates.',
        })
        if (result === 0) {
            // 'Restart Now' button
            autoUpdater.quitAndInstall()
        }
    })

    autoUpdater.on('error', (error) => {
        console.error('AutoUpdater error:', error)
        dialog.showErrorBox(
            'Update Error',
            `Failed to update the application: ${error == null ? 'unknown' : (error.stack || error).toString()}`
        )
    })

    ipcMain.on('restart_app', () => {
        autoUpdater.quitAndInstall()
    })
}
