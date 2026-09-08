/**
 * The pre-break reminder.
 *
 * Why this is not simply an OS notification: macOS only renders notification
 * action buttons for an app that is both code signed *and* declares
 * `NSUserNotificationAlertStyle: alert`. BlinkBlink ships unsigned, so on macOS
 * the "Skip this break" button silently never appeared, and depending on the
 * user's Focus/Do-Not-Disturb settings the notification itself may be
 * suppressed too — leaving the feature looking broken with nothing in the logs.
 *
 * So the default is BlinkBlink's own toast window, which behaves identically on
 * all three platforms and can always offer its actions. Users who prefer their
 * notification centre can switch `reminderStyle` to `system`, and if that path
 * fails at runtime it falls back to the toast rather than showing nothing.
 */

import { BrowserWindow, Notification, screen } from 'electron'
import * as path from 'path'
import { getSettings, getWorkDuration } from './store'
import { canShowNotificationActions, getBackdropMode, isMac, isWindows } from './platform'
import { skipBreaksFor } from './timer'
import { appEvents } from './events'

const TOAST_WIDTH = 340
const TOAST_HEIGHT = 128
const TOAST_MARGIN = 16

/** However long the offset is, the toast never lingers for more than this. */
const MAX_VISIBLE_MS = 60_000

let toastWindow: BrowserWindow | null = null
let autoCloseTimer: NodeJS.Timeout | undefined

export function closeReminder(): void {
    if (autoCloseTimer) {
        clearTimeout(autoCloseTimer)
        autoCloseTimer = undefined
    }
    if (toastWindow && !toastWindow.isDestroyed()) toastWindow.close()
    toastWindow = null
}

/**
 * Toast placement, following each platform's own notification convention:
 * top-right on macOS and most Linux desktops, bottom-right on Windows.
 */
function toastPosition(): { x: number; y: number } {
    const { workArea } = screen.getPrimaryDisplay()
    const x = workArea.x + workArea.width - TOAST_WIDTH - TOAST_MARGIN
    const y = isWindows ? workArea.y + workArea.height - TOAST_HEIGHT - TOAST_MARGIN : workArea.y + TOAST_MARGIN
    return { x, y }
}

function showToast(breakAt: Date): void {
    closeReminder()

    // A `solid` backdrop means transparency is unavailable or unwanted; the
    // toast then fills a square window instead of leaving black corners.
    const transparent = getBackdropMode(getSettings().overlayBackdrop) !== 'solid'
    const { x, y } = toastPosition()

    toastWindow = new BrowserWindow({
        x,
        y,
        width: TOAST_WIDTH,
        height: TOAST_HEIGHT,
        show: false,
        frame: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        transparent,
        backgroundColor: transparent ? '#00000000' : '#202226',
        hasShadow: !transparent,
        // A reminder must never steal focus from what the user is typing into.
        focusable: false,
        alwaysOnTop: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    })

    toastWindow.setAlwaysOnTop(true, 'screen-saver')
    if (isMac) toastWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    toastWindow.loadFile(path.join(__dirname, 'reminder.html'), {
        query: { breakAt: String(breakAt.getTime()), shape: transparent ? 'rounded' : 'square' },
    })

    toastWindow.once('ready-to-show', () => {
        // showInactive keeps the user's current window focused.
        toastWindow?.showInactive()
    })

    toastWindow.on('closed', () => {
        toastWindow = null
    })

    const visibleFor = Math.min(MAX_VISIBLE_MS, Math.max(2000, breakAt.getTime() - Date.now()))
    autoCloseTimer = setTimeout(closeReminder, visibleFor)
}

/**
 * Native notification path.
 *
 * Returns false when the platform cannot deliver it, so the caller can fall
 * back to the toast instead of the reminder silently going nowhere.
 */
function showSystemNotification(breakAt: Date): boolean {
    if (!Notification.isSupported()) {
        console.warn('[reminder] system notifications are unavailable; falling back to the in-app toast')
        return false
    }

    const seconds = Math.max(1, Math.round((breakAt.getTime() - Date.now()) / 1000))
    const withActions = canShowNotificationActions()

    try {
        const notification = new Notification({
            title: 'Break coming up',
            body:
                seconds >= 60
                    ? `Your break starts in about ${Math.round(seconds / 60)} minute(s).`
                    : `Your break starts in ${seconds} seconds.`,
            silent: false,
            ...(withActions ? { actions: [{ type: 'button' as const, text: 'Skip this break' }] } : {}),
        })

        notification.on('action', () => {
            skipBreaksFor(Math.max(1, Math.floor(getWorkDuration() / 60_000)))
            notification.close()
        })

        notification.on('failed', (_event, error) => {
            console.error('[reminder] system notification failed:', error)
        })

        notification.show()

        if (!withActions) {
            console.info('[reminder] notification action buttons need a signed macOS build; showing a plain notification')
        }

        return true
    } catch (error) {
        console.error('[reminder] could not show a system notification:', error)
        return false
    }
}

/** Shows the reminder for a break due at `breakAt`, honouring user settings. */
export function showBreakReminder(breakAt: Date): void {
    const settings = getSettings()
    if (!settings.enableBreakNotification) return

    if (settings.reminderStyle === 'system' && showSystemNotification(breakAt)) return

    showToast(breakAt)
}

/** Wires the reminder to the timer's signals. Call once during startup. */
export function registerReminder(): void {
    appEvents.on('reminder-due', ({ breakAt }) => showBreakReminder(breakAt))
    // The toast has served its purpose the moment the overlay appears.
    appEvents.on('break-due', () => closeReminder())
}
