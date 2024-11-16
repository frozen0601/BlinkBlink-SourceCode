import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { download } from 'electron-dl'
import * as path from 'path'
import fetch from 'node-fetch'

// Interface definitions moved from main.ts
interface GitHubAsset {
    name: string
    browser_download_url: string
}

interface GitHubRelease {
    tag_name: string
    assets: GitHubAsset[]
}

// Export the update-related methods
export async function showDialog(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    return dialog.showMessageBox(win, {
        ...options,
        icon: path.join(__dirname, 'icon.png'), // Add custom icon to all dialogs
    })
}

export async function showUpdateInstructions(): Promise<void> {
    const { response } = await showDialog({
        type: 'info',
        buttons: ['View Installation Guide', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update Downloaded',
        message: 'The update has been downloaded to your Downloads folder.',
        detail: 'Click "View Installation Guide" to see step-by-step instructions.\n\nYou can complete the installation when you\'re ready to restart the app.',
    })

    if (response === 0) {
        const guidePath = path.join(process.resourcesPath, 'mac-update-guide.html')
        await shell.openPath(guidePath)
    }
}

export function createProgressWindow(): BrowserWindow {
    const progressWin = new BrowserWindow({
        width: 320,
        height: 80,
        frame: false,
        transparent: true,
        resizable: false,
        show: false,
        center: true,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        vibrancy: 'menu', // macOS only
    })

    progressWin.loadFile(path.join(__dirname, 'progress.html'))
    progressWin.once('ready-to-show', () => {
        progressWin.show()
        progressWin.setVibrancy('menu') // Ensure vibrancy is applied
    })

    return progressWin
}

export async function downloadMacOSUpdate(dmgAsset: GitHubAsset) {
    let win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    let tempWindow: BrowserWindow | null = null
    let progressWin: BrowserWindow | null = null

    if (!win) {
        tempWindow = new BrowserWindow({ show: false })
        win = tempWindow
    }

    try {
        progressWin = createProgressWindow()

        await download(win, dmgAsset.browser_download_url, {
            onProgress: (progress) => {
                if (progressWin && !progressWin.isDestroyed()) {
                    progressWin.webContents.send('download-progress', progress)
                }
            },
        })

        // Close progress window and wait a bit before showing next dialog
        if (progressWin && !progressWin.isDestroyed()) {
            progressWin.close()
            await new Promise((resolve) => setTimeout(resolve, 500)) // Add 500ms delay
        }

        const dmgPath = path.join(app.getPath('downloads'), dmgAsset.name)
        await shell.openPath(dmgPath)
        if (tempWindow) tempWindow.destroy()
        await showUpdateInstructions()
    } catch (error) {
        if (progressWin && !progressWin.isDestroyed()) {
            progressWin.close()
        }
        if (tempWindow) tempWindow.destroy()
        await showDialog({
            type: 'error',
            title: 'Download Failed',
            message: 'Failed to download the update. Please try again later.',
        })
    }
}

export async function checkMacOSUpdate() {
    const currentVersion = app.getVersion()
    const latestRelease = await getLatestReleaseFromGitHub()
    const latestVersion = latestRelease.tag_name.replace('v', '')

    if (latestVersion <= currentVersion) {
        await showDialog({
            type: 'info',
            title: 'No Updates',
            message: 'You are using the latest version.',
        })
        return
    }

    const { response } = await showDialog({
        type: 'info',
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update Available',
        message: `A new version (${latestVersion}) is available. Do you want to download it?`,
    })

    if (response !== 0) return

    const dmgAsset = latestRelease.assets.find((asset) => asset.name.endsWith('.dmg'))
    if (!dmgAsset) {
        await showDialog({
            type: 'error',
            title: 'Error',
            message: 'DMG file not found in the latest release.',
        })
        return
    }

    await downloadMacOSUpdate(dmgAsset)
}

export async function checkForUpdates(silent = false) {
    // if (process.env.NODE_ENV === 'development') {
    //     console.log('Simulating update check...')
    //     return
    // }

    try {
        if (process.platform === 'darwin') {
            const currentVersion = app.getVersion()
            const latestRelease = await getLatestReleaseFromGitHub()
            const latestVersion = latestRelease.tag_name.replace('v', '')

            if (latestVersion <= currentVersion) {
                if (!silent) {
                    await showDialog({
                        type: 'info',
                        title: 'No Updates',
                        message: 'You are using the latest version.',
                    })
                }
                return
            }

            if (silent) {
                // On startup, just show the download prompt without the "No Updates" message
                const { response } = await showDialog({
                    type: 'info',
                    buttons: ['Download', 'Later'],
                    defaultId: 0,
                    cancelId: 1,
                    title: 'Update Available',
                    message: `A new version (${latestVersion}) is available. Do you want to download it?`,
                })

                if (response === 0) {
                    const dmgAsset = latestRelease.assets.find((asset) => asset.name.endsWith('.dmg'))
                    if (dmgAsset) {
                        await downloadMacOSUpdate(dmgAsset)
                    }
                }
            } else {
                await checkMacOSUpdate() // Use existing detailed update flow for manual checks
            }
        } else {
            await autoUpdater.checkForUpdatesAndNotify()
        }
    } catch (error) {
        console.error('Error checking for updates:', error)
        if (!silent) {
            await showDialog({
                type: 'error',
                title: 'Update Check Failed',
                message: 'Failed to check for updates. Please try again later.',
            })
        }
    }
}

export async function getLatestReleaseFromGitHub(): Promise<GitHubRelease> {
    const response = await fetch('https://api.github.com/repos/frozen0601/BlinkBlink-Releases/releases/latest')
    if (!response.ok) {
        throw new Error('Failed to fetch latest release')
    }
    return response.json() as Promise<GitHubRelease> // Cast to Promise<GitHubRelease>
}
