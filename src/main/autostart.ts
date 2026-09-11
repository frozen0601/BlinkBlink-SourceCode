/**
 * "Start on system startup".
 *
 * `app.setLoginItemSettings` is implemented on macOS and Windows only — on
 * Linux it is a silent no-op, which is why the checkbox appeared to work and
 * then did nothing. Linux gets a freedesktop autostart entry instead.
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { autostartEntryIsStale } from '../core/autostart'
import { getAutostartMechanism, isAppImage } from './platform'

const DESKTOP_ENTRY_NAME = 'blinkblink.desktop'

function autostartDir(): string {
    const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    return path.join(configHome, 'autostart')
}

function autostartFile(): string {
    return path.join(autostartDir(), DESKTOP_ENTRY_NAME)
}

/**
 * The command that relaunches this exact install.
 *
 * An AppImage runs from a temporary mount, so `process.execPath` points at
 * something that will not exist next boot; `APPIMAGE` holds the real file.
 */
function launchCommand(): string {
    const executable = isAppImage() && process.env.APPIMAGE ? process.env.APPIMAGE : process.execPath
    // Quote so paths containing spaces survive the desktop-entry parser.
    return `"${executable}" --hidden`
}

function desktopEntry(): string {
    return [
        '[Desktop Entry]',
        'Type=Application',
        'Name=BlinkBlink',
        'Comment=Healthy Eyes, Happy Life',
        `Exec=${launchCommand()}`,
        'Icon=blinkblink',
        'Terminal=false',
        'Categories=Utility;',
        'X-GNOME-Autostart-enabled=true',
        '',
    ].join('\n')
}

export interface AutostartResult {
    /** Whether the requested state is now in effect. */
    ok: boolean
    /** Present when the platform cannot support the request. */
    reason?: string
}

export function setAutostart(enabled: boolean): AutostartResult {
    switch (getAutostartMechanism()) {
        case 'login-item':
            try {
                app.setLoginItemSettings({
                    openAtLogin: enabled,
                    openAsHidden: true,
                    // `path`/`args` are Windows-only; passing them on macOS is
                    // ignored, and pointing at the executable rather than the
                    // .app bundle there would be wrong anyway.
                    ...(process.platform === 'win32' ? { path: process.execPath, args: ['--hidden'] } : {}),
                })
                return { ok: true }
            } catch (error) {
                console.error('[autostart] setLoginItemSettings failed:', error)
                return { ok: false, reason: 'The operating system refused the request.' }
            }

        case 'xdg-autostart':
            try {
                if (enabled) {
                    fs.mkdirSync(autostartDir(), { recursive: true })
                    fs.writeFileSync(autostartFile(), desktopEntry(), 'utf-8')
                } else {
                    fs.rmSync(autostartFile(), { force: true })
                }
                return { ok: true }
            } catch (error) {
                console.error('[autostart] could not write the desktop entry:', error)
                return { ok: false, reason: 'Could not write to the autostart directory.' }
            }

        case 'unsupported':
        default:
            return { ok: false, reason: 'Automatic startup is managed by your package manager on this platform.' }
    }
}

export function isAutostartEnabled(): boolean {
    switch (getAutostartMechanism()) {
        case 'login-item':
            try {
                return app.getLoginItemSettings().openAtLogin
            } catch {
                return false
            }
        case 'xdg-autostart':
            return fs.existsSync(autostartFile())
        default:
            return false
    }
}

export function isAutostartSupported(): boolean {
    return getAutostartMechanism() !== 'unsupported'
}

/**
 * Re-applies the stored preference at startup.
 *
 * The entry can drift out of sync — the app was moved, reinstalled from a
 * different package, or the desktop file was removed by a cleanup tool. It also
 * drifts on its own after an AppImage update, which replaces the running file
 * with one named for the new version; the entry is then pointing at a path that
 * no longer exists, and nothing would notice until the next login.
 */
export function syncAutostart(desired: boolean): void {
    if (!isAutostartSupported()) return

    if (isAutostartEnabled() !== desired) {
        setAutostart(desired)
        return
    }

    if (!desired || getAutostartMechanism() !== 'xdg-autostart') return

    try {
        if (autostartEntryIsStale(fs.readFileSync(autostartFile(), 'utf-8'), launchCommand())) {
            fs.writeFileSync(autostartFile(), desktopEntry(), 'utf-8')
            console.info('[autostart] rewrote the desktop entry: it pointed at a different executable')
        }
    } catch (error) {
        console.error('[autostart] could not check the existing desktop entry:', error)
    }
}
