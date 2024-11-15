import { app, BrowserWindow, ipcMain, nativeTheme, powerMonitor, dialog, shell, clipboard } from 'electron'
import * as path from 'path'
import { store } from './store'
import { Settings } from './storeTypes'
import * as fs from 'fs'
import { startWorkTimer, clearTimer, isRunning } from './timer'
import { showBreakView, showSummaryView, closeAllWindows } from './windows'
import { DURATIONS } from './constants'
import { autoUpdater } from 'electron-updater'
import { createTray, destroyTray, updateTooltip } from './tray'
import { download } from 'electron-dl'
import fetch from 'node-fetch'

// Add these interfaces at the top of the file with other imports
interface GitHubAsset {
    name: string
    browser_download_url: string
}

interface GitHubRelease {
    tag_name: string
    assets: GitHubAsset[]
}

// Alternative: Create a local HTML file and use file:// URL

function getUpdateGuidePath(): string {
    return path.join(__dirname, 'update-guide.html')
}

// Stats Management
export function updateBreakStats(skipped: boolean) {
    const stats = store.get('stats')
    const currentTime = Date.now()

    if (skipped) {
        // Reset current streak but preserve highest
        store.set('stats', {
            ...stats,
            breakStreakCount: 0,
            breakStreakDuration: 0,
            streakStartTime: currentTime,
        })
    } else {
        // Completing a break successfully
        const newCount = stats.breakStreakCount + 1
        const newDuration = stats.breakStreakDuration + DURATIONS.WORK_DURATION

        const updatedStats = {
            ...stats,
            breakStreakCount: newCount,
            breakStreakDuration: newDuration,
        }

        // Update highest streak if current is higher
        if (newCount > stats.highestStreakCount) {
            updatedStats.highestStreakCount = newCount
            updatedStats.highestStreakDuration = newDuration
            updatedStats.highestStreakStartTime = stats.streakStartTime
            updatedStats.highestStreakEndTime = currentTime
        }

        store.set('stats', updatedStats)
    }
    store.set('lastBreakEndTime', currentTime)
}

function getIconPath() {
    return process.platform === 'win32'
        ? path.join(__dirname, 'icon.ico')
        : process.platform === 'darwin'
        ? path.join(__dirname, 'icon.icns')
        : path.join(__dirname, 'icon.png')
}

function createWindow(options: Electron.BrowserWindowConstructorOptions, filePath: string, onClose: () => void) {
    const window = new BrowserWindow({
        ...options,
        show: false, // Don't show the window immediately
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#f5f5f5',
        icon: getIconPath(),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    })

    window.loadFile(path.join(__dirname, filePath))
    window.on('closed', onClose)

    // Show the window once it's ready
    window.once('ready-to-show', () => {
        window.show()
    })

    return window
}

// Simplified IPC handlers
ipcMain.on('start-break-countdown', () => {
    if (isRunning()) {
        showBreakView()
    }
})

ipcMain.on('break-skip', () => {
    updateBreakStats(true)
    closeAllWindows()
    startWorkTimer()
})

ipcMain.on('break-complete', () => {
    updateBreakStats(false)
    showSummaryView()
})

ipcMain.on('summary-dismissed', () => {
    startWorkTimer()
    closeAllWindows()
})

// Data access handlers
ipcMain.handle('get-stats', () => store.get('stats'))
ipcMain.handle('get-settings', () => store.get('settings'))
ipcMain.handle('get-summary-duration', () => store.get('settings')?.summaryDuration)

// IPC Handler - get app info from package.json
ipcMain.handle('get-app-info', () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    return {
        version: packageJson.version,
        author: packageJson.author,
        description: packageJson.description,
        license: packageJson.license,
        website: packageJson.homepage,
        supportEmail: 'theblinkblinkapp@gmail.com',
    }
})

// Helper function for showing dialogs
async function showDialog(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    return dialog.showMessageBox(win, options)
}

const XATTR_COMMAND = 'xattr -c /Applications/BlinkBlink.app'

async function showInstallSteps(): Promise<void> {
    // Step 1: Installation
    const { response: installResponse } = await showDialog({
        type: 'info',
        buttons: ['Next', 'Exit'],
        defaultId: 0,
        cancelId: 1,
        title: 'Installation - Step 1',
        message: 'Please drag BlinkBlink.app to your Applications folder.',
        detail: 'Click "Next" after you have completed this step.',
    })

    if (installResponse === 1) {
        app.quit()
        return
    }

    // Step 2: Terminal command
    const { response: terminalResponse } = await showDialog({
        type: 'info',
        buttons: ['Copy Command & Open Terminal', 'Copy Command', 'Exit'],
        defaultId: 0,
        cancelId: 2,
        title: 'Installation - Step 2',
        message: 'Final step: Run this command in Terminal to complete installation:',
        detail: `${XATTR_COMMAND}\n\nThis removes the quarantine attribute and allows the app to run.`,
    })

    clipboard.writeText(XATTR_COMMAND)

    if (terminalResponse === 0) {
        // Open Terminal app
        await shell.openPath('/System/Applications/Utilities/Terminal.app')
    }

    // Give user time to run the command before exiting
    const { response: finalResponse } = await showDialog({
        type: 'info',
        buttons: ['Exit'],
        defaultId: 0,
        title: 'Installation Complete',
        message: 'After running the command in Terminal, you can restart BlinkBlink.',
        detail: 'The app will now close. Please relaunch it to use the new version.',
    })

    app.quit()
}

async function showUpdateInstructions(): Promise<void> {
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
        await shell.openPath(getUpdateGuidePath())
    }
}

async function downloadMacOSUpdate(dmgAsset: GitHubAsset) {
    let win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    let tempWindow: BrowserWindow | null = null

    if (!win) {
        tempWindow = new BrowserWindow({ show: false })
        win = tempWindow
    }

    try {
        await download(win, dmgAsset.browser_download_url)
        const dmgPath = path.join(app.getPath('downloads'), dmgAsset.name)
        await shell.openPath(dmgPath)
        if (tempWindow) tempWindow.destroy()
        await showUpdateInstructions()
    } catch (error) {
        if (tempWindow) tempWindow.destroy()
        await showDialog({
            type: 'error',
            title: 'Download Failed',
            message: 'Failed to download the update. Please try again later.',
        })
    }
}

async function checkMacOSUpdate() {
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

async function checkForUpdates(silent = false) {
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

// IPC Handler - Check for updates (manual check)
ipcMain.handle('check-for-updates', () => checkForUpdates(false))

// IPC Handlers - Settings
ipcMain.on('save-settings', (event, settings: Settings) => {
    store.set('settings', settings)
    // Configure auto-start behavior
    app.setLoginItemSettings({
        openAtLogin: settings.startOnBoot,
        // For Windows, this ensures the app starts minimized in tray
        openAsHidden: true,
        // Required for macOS to work properly
        path: app.getPath('exe'),
    })
})

// App Lifecycle Events
app.whenReady().then(() => {
    if (process.platform === 'win32') {
        app.setAppUserModelId('BlinkBLink')
    }
    if (process.platform === 'darwin') app.dock.hide()
    createTray()
    startWorkTimer()
    updateTooltip()

    // Automatically check for updates on startup
    checkForUpdates(true)

    // Initialize auto-start setting based on stored preference
    const settings = store.get('settings')
    app.setLoginItemSettings({
        openAtLogin: settings?.startOnBoot || false,
        openAsHidden: true,
        path: app.getPath('exe'),
    })

    // Handle system resume events
    powerMonitor.on('resume', () => {
        startWorkTimer()
    })

    powerMonitor.on('unlock-screen', () => {
        startWorkTimer()
    })
})

app.on('window-all-closed', () => {
    // Keep the app running in the tray
})

// Gracefully handle app quitting
app.on('before-quit', () => {
    clearTimer()
    closeAllWindows()
    destroyTray()
})

async function getLatestReleaseFromGitHub(): Promise<GitHubRelease> {
    const response = await fetch('https://api.github.com/repos/frozen0601/BlinkBlink-Releases/releases/latest')
    if (!response.ok) {
        throw new Error('Failed to fetch latest release info')
    }
    return response.json() as Promise<GitHubRelease>
}
