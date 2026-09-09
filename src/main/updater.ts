/**
 * Update checking.
 *
 * Three different stories, because the platforms genuinely differ:
 *
 * - Windows: NSIS builds carry a signature chain electron-updater can verify,
 *   so updates download and install themselves.
 * - macOS: Squirrel.Mac refuses to apply an update to an unsigned app, so the
 *   app fetches the DMG, drops it in Downloads and points at the install steps.
 * - Linux: snap, deb, rpm and AppImage are all owned by something else. The app
 *   says where updates come from rather than pretending to manage them.
 */

import { app, BrowserWindow, dialog, shell } from 'electron'
import { download } from 'electron-dl'
import * as path from 'path'
import { getSettings } from './store'
import { isAppImage, isLinux, isMac, isSnap } from './platform'
import { isNewerVersion, pickAssetForArch, ReleaseAsset, pickLatestRelease, ReleaseSummary } from '../core/update'

const RELEASES_API = 'https://api.github.com/repos/frozen0601/BlinkBlink-Releases/releases'
const INSTALL_GUIDE_URL = 'https://2ly.link/216pI'
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000

let autoUpdateTimer: NodeJS.Timeout | null = null

async function showDialog(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const withIcon = { ...options, icon: path.join(__dirname, 'icon.png') }
    // `showMessageBox` rejects a null parent, so branch rather than passing one.
    return parent && !parent.isDestroyed() ? dialog.showMessageBox(parent, withIcon) : dialog.showMessageBox(withIcon)
}

/**
 * The newest published, non-draft, non-prerelease release.
 *
 * Sorted by version rather than publication date so that re-publishing an old
 * release cannot advertise it as an update.
 */
export async function getLatestReleaseFromGitHub(): Promise<ReleaseSummary> {
    const response = await fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `BlinkBlink/${app.getVersion()}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (!response.ok) throw new Error(`GitHub returned ${response.status} ${response.statusText}`)

    const latest = pickLatestRelease((await response.json()) as ReleaseSummary[])
    if (!latest) throw new Error('No published releases found')
    return latest
}

function createProgressWindow(): BrowserWindow {
    const progressWindow = new BrowserWindow({
        width: 340,
        height: 92,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        resizable: false,
        show: false,
        center: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        webPreferences: {
            // Previously this window had no preload at all while its page used
            // `window.api`, so the progress bar never moved. It also ran with
            // node integration enabled, which it never needed.
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
        ...(isMac && { vibrancy: 'menu' as const }),
    })

    progressWindow.loadFile(path.join(__dirname, 'progress.html'))
    progressWindow.once('ready-to-show', () => progressWindow.showInactive())

    return progressWindow
}

async function downloadMacOSUpdate(asset: ReleaseAsset): Promise<void> {
    // `electron-dl` needs a window to attach the download session to.
    let host = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    let temporaryHost: BrowserWindow | null = null
    let progressWindow: BrowserWindow | null = null

    if (!host || host.isDestroyed()) {
        temporaryHost = new BrowserWindow({ show: false })
        host = temporaryHost
    }

    try {
        progressWindow = createProgressWindow()

        await download(host, asset.browser_download_url, {
            onProgress: (progress) => {
                if (progressWindow && !progressWindow.isDestroyed()) {
                    progressWindow.webContents.send('download-progress', progress)
                }
            },
        })

        progressWindow.close()
        progressWindow = null

        await shell.openPath(path.join(app.getPath('downloads'), asset.name))
        const { response } = await showDialog({
            type: 'info',
            buttons: ['View Installation Guide', 'Later'],
            defaultId: 0,
            cancelId: 1,
            title: 'Update Downloaded',
            message: 'The update has been downloaded to your Downloads folder.',
            detail: 'Open the disk image and drag BlinkBlink to Applications. You can finish whenever you are ready to restart the app.',
        })

        if (response === 0) await shell.openExternal(INSTALL_GUIDE_URL)
    } catch (error) {
        console.error('[updater] macOS download failed:', error)
        await showDialog({
            type: 'error',
            title: 'Download Failed',
            message: 'Failed to download the update.',
            detail: error instanceof Error ? error.message : 'Please try again later.',
        })
    } finally {
        if (progressWindow && !progressWindow.isDestroyed()) progressWindow.close()
        if (temporaryHost && !temporaryHost.isDestroyed()) temporaryHost.destroy()
    }
}

function linuxUpdateMessage(): { message: string; detail: string } {
    if (isSnap()) {
        return { message: 'Updates are handled automatically by Snap.', detail: 'Run `snap refresh blinkblink` to check immediately.' }
    }
    if (isAppImage()) {
        return {
            message: 'This is an AppImage build.',
            detail: 'Download the latest AppImage from the BlinkBlink releases page and replace this file.',
        }
    }
    return {
        message: 'Updates are handled by your package manager.',
        detail: 'Use your distribution’s updater to install the newest BlinkBlink package.',
    }
}

/**
 * Checks for a newer release.
 *
 * `silent` suppresses "you are up to date" and any error dialog, for the
 * periodic background check.
 */
export async function checkForUpdates(silent = false): Promise<{ updateAvailable: boolean; version?: string }> {
    try {
        if (isLinux) {
            if (!silent) await showDialog({ type: 'info', title: 'Updates', ...linuxUpdateMessage() })
            return { updateAvailable: false }
        }

        const latest = await getLatestReleaseFromGitHub()
        const currentVersion = app.getVersion()
        const latestVersion = latest.tag_name.replace(/^v/, '')

        if (!isNewerVersion(latest.tag_name, currentVersion)) {
            if (!silent) await showDialog({ type: 'info', title: 'No Updates', message: 'You are using the latest version.' })
            return { updateAvailable: false }
        }

        if (isMac) {
            const { response } = await showDialog({
                type: 'info',
                buttons: ['Download', 'Later'],
                defaultId: 0,
                cancelId: 1,
                title: 'Update Available',
                message: `BlinkBlink ${latestVersion} is available.`,
                detail: `You are running ${currentVersion}.`,
            })

            if (response === 0) {
                // An arm64 build will not launch at all on an Intel Mac, so the
                // architecture has to match rather than "whatever came first".
                const asset = pickAssetForArch(latest.assets, '.dmg', process.arch)

                if (!asset) {
                    await showDialog({ type: 'error', title: 'Update Unavailable', message: 'This release has no macOS download.' })
                    return { updateAvailable: true, version: latestVersion }
                }

                await downloadMacOSUpdate(asset)
            }

            return { updateAvailable: true, version: latestVersion }
        }

        // Windows: electron-updater downloads and installs.
        const { autoUpdater } = await import('electron-updater')
        await autoUpdater.checkForUpdatesAndNotify()
        return { updateAvailable: true, version: latestVersion }
    } catch (error) {
        console.error('[updater] update check failed:', error)
        if (!silent) {
            await showDialog({
                type: 'error',
                title: 'Update Check Failed',
                message: 'Could not check for updates.',
                detail: error instanceof Error ? error.message : 'Please try again later.',
            })
        }
        return { updateAvailable: false }
    }
}

export function startAutoUpdateTimer(): void {
    stopAutoUpdateTimer()

    if (isLinux) return
    if (!getSettings().autoUpdate) return

    void checkForUpdates(true)
    autoUpdateTimer = setInterval(() => void checkForUpdates(true), CHECK_INTERVAL_MS)
    autoUpdateTimer.unref?.()
}

export function stopAutoUpdateTimer(): void {
    if (autoUpdateTimer) {
        clearInterval(autoUpdateTimer)
        autoUpdateTimer = null
    }
}
