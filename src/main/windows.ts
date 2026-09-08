/**
 * The full-screen break / summary overlay.
 *
 * Backdrop handling is the fiddly part. Only macOS (native vibrancy) and
 * Windows 11 22H2+ (DWM acrylic) can blur what sits *behind* a window; CSS
 * `backdrop-filter` explicitly cannot — it only sees the window's own web
 * contents. Everywhere else the overlay draws a translucent scrim over a
 * transparent window, and `solid` is the always-works fallback.
 *
 * The mode is chosen in the main process and passed to the renderer as a query
 * parameter so the correct styling is in place on the very first paint.
 */

import { BrowserWindow, screen } from 'electron'
import * as path from 'path'
import { getBreakDuration, getSettings } from './store'
import { handleBreakComplete, handleSummaryDismissed } from './controller'
import { getBackdropMode, isLinux, isMac, isWindows } from './platform'
import { BackdropMode } from '../core/types'

type ViewType = 'break' | 'summary'

interface OverlayWindow {
    window: BrowserWindow
    /** Set before an intentional close; the close handler blocks everything else. */
    allowClose: boolean
}

interface ShowConfig {
    type: ViewType
    durationMs: number
    autoDismiss: boolean
    onComplete: () => void
}

/**
 * Backdrop-specific window options.
 *
 * The `acrylic` case is the Windows fix: `backgroundMaterial` asks DWM to draw
 * the material, but Electron's default window background is an opaque `#FFF`
 * painted on top of it — which is exactly the "dead white" panel users saw.
 * A fully transparent background colour lets the material through.
 */
function backdropWindowOptions(mode: BackdropMode): Electron.BrowserWindowConstructorOptions {
    switch (mode) {
        case 'vibrancy':
            return {
                transparent: true,
                backgroundColor: '#00000000',
                vibrancy: 'fullscreen-ui',
                visualEffectState: 'active',
            }
        case 'acrylic':
            return {
                transparent: false,
                backgroundColor: '#00000000',
                backgroundMaterial: 'acrylic',
            }
        case 'translucent':
            return {
                transparent: true,
                backgroundColor: '#00000000',
            }
        case 'solid':
        default:
            return {
                transparent: false,
                backgroundColor: '#101014',
            }
    }
}

class WindowManager {
    #windowsByDisplay = new Map<number, OverlayWindow>()
    #countdownInterval?: NodeJS.Timeout
    #activeConfig: ShowConfig | null = null
    #displayListenersBound = false

    // Public API --------------------------------------------------------

    showBreakView(): void {
        this.#show({
            type: 'break',
            durationMs: getBreakDuration(),
            autoDismiss: true,
            onComplete: () => handleBreakComplete(),
        })
    }

    showSummaryView(): void {
        const settings = getSettings()
        this.#show({
            type: 'summary',
            durationMs: settings.summaryDuration,
            autoDismiss: settings.enableAutoDismiss,
            onComplete: () => handleSummaryDismissed(),
        })
    }

    closeAllWindows(): void {
        this.#stopCountdown()
        this.#activeConfig = null

        for (const entry of this.#windowsByDisplay.values()) {
            entry.allowClose = true
            if (!entry.window.isDestroyed()) entry.window.close()
        }
        this.#windowsByDisplay.clear()
    }

    isShowing(): boolean {
        return this.#windowsByDisplay.size > 0
    }

    // Internals ---------------------------------------------------------

    #show(config: ShowConfig): void {
        this.#stopCountdown()
        this.#activeConfig = config
        this.#bindDisplayListeners()

        const backdrop = getBackdropMode(getSettings().overlayBackdrop)

        for (const display of screen.getAllDisplays()) {
            this.#ensureWindow(display, backdrop, config.type)
        }

        if (config.autoDismiss && Number.isFinite(config.durationMs) && config.durationMs > 0) {
            this.#startCountdown(config)
        }
    }

    #ensureWindow(display: Electron.Display, backdrop: BackdropMode, view: ViewType): void {
        const existing = this.#windowsByDisplay.get(display.id)
        if (existing && !existing.window.isDestroyed()) {
            existing.window.setBounds(display.bounds)
            existing.window.webContents.send('show-view', view)
            return
        }

        const window = new BrowserWindow({
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height,
            show: false,
            frame: false,
            resizable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            skipTaskbar: true,
            hasShadow: false,
            // macOS refuses to size a window past the screen without this.
            enableLargerThanScreen: isMac,
            ...backdropWindowOptions(backdrop),
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                devTools: !process.env.BLINKBLINK_NO_DEVTOOLS,
            },
        })

        const entry: OverlayWindow = { window, allowClose: false }
        this.#windowsByDisplay.set(display.id, entry)

        // The backdrop mode travels as a query parameter rather than an IPC
        // message so the stylesheet has it before the first paint; sending it
        // afterwards produces a visible flash of the wrong treatment.
        window.loadFile(path.join(__dirname, 'overlay.html'), {
            query: { backdrop, view },
        })

        this.#applyPlatformBehaviour(window)
        this.#bindWindowEvents(entry, display.id)

        window.once('ready-to-show', () => {
            if (window.isDestroyed()) return
            window.setBounds(display.bounds)
            window.show()
            // Re-assert after showing: some window managers drop the hint when
            // the window is first mapped.
            window.setAlwaysOnTop(true, 'screen-saver')
        })
    }

    /**
     * Per-platform window behaviour.
     *
     * Notably absent compared with the previous version: the Linux branch no
     * longer requests `type: 'notification'`. That window type is meant for
     * transient toasts, and several window managers treat it as non-interactive
     * or refuse to place it full screen, which left the Linux overlay unusable.
     */
    #applyPlatformBehaviour(window: BrowserWindow): void {
        window.setAlwaysOnTop(true, 'screen-saver')

        if (isMac) {
            window.setWindowButtonVisibility(false)
            window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
            return
        }

        if (isLinux) {
            // Virtual desktops are common on Linux; without this the overlay
            // only covers the workspace it was created on.
            window.setVisibleOnAllWorkspaces(true)
        }

        if (isWindows || isLinux) {
            window.setMenuBarVisibility(false)
        }
    }

    #bindWindowEvents(entry: OverlayWindow, displayId: number): void {
        const { window } = entry

        // `closable: false` is documented as not implemented on Linux, so the
        // guard is enforced here instead of relying on the window flag.
        window.on('close', (event) => {
            if (!entry.allowClose) event.preventDefault()
        })

        window.on('closed', () => {
            this.#windowsByDisplay.delete(displayId)
            if (this.#windowsByDisplay.size === 0) this.#stopCountdown()
        })

        window.webContents.on('render-process-gone', (_event, details) => {
            console.error('[overlay] renderer gone:', details.reason)
            entry.allowClose = true
            if (!window.isDestroyed()) window.close()
        })
    }

    /** Keeps the overlay set in step with monitors being plugged in or out. */
    #bindDisplayListeners(): void {
        if (this.#displayListenersBound) return
        this.#displayListenersBound = true

        screen.on('display-added', (_event, display) => {
            if (!this.#activeConfig) return
            this.#ensureWindow(display, getBackdropMode(getSettings().overlayBackdrop), this.#activeConfig.type)
        })

        screen.on('display-removed', (_event, display) => {
            const entry = this.#windowsByDisplay.get(display.id)
            if (!entry) return
            entry.allowClose = true
            if (!entry.window.isDestroyed()) entry.window.close()
            this.#windowsByDisplay.delete(display.id)
        })

        screen.on('display-metrics-changed', (_event, display) => {
            const entry = this.#windowsByDisplay.get(display.id)
            if (entry && !entry.window.isDestroyed()) entry.window.setBounds(display.bounds)
        })
    }

    /**
     * One countdown for the whole overlay set.
     *
     * The previous implementation started an interval per display, so a
     * two-monitor setup ran two competing countdowns and whichever finished
     * first decided the transition.
     */
    #startCountdown(config: ShowConfig): void {
        const endsAt = Date.now() + config.durationMs
        this.#broadcast('start-countdown', config.durationMs)
        this.#broadcast('countdown-update', Math.ceil(config.durationMs / 1000))

        this.#countdownInterval = setInterval(() => {
            const remainingMs = endsAt - Date.now()

            if (remainingMs <= 0) {
                this.#stopCountdown()
                config.onComplete()
                return
            }

            this.#broadcast('countdown-update', Math.ceil(remainingMs / 1000))
        }, 250)
    }

    #stopCountdown(): void {
        if (this.#countdownInterval) {
            clearInterval(this.#countdownInterval)
            this.#countdownInterval = undefined
        }
    }

    #broadcast(channel: string, payload: unknown): void {
        for (const { window } of this.#windowsByDisplay.values()) {
            if (!window.isDestroyed()) window.webContents.send(channel, payload)
        }
    }
}

const windowManager = new WindowManager()

export const showBreakView = () => windowManager.showBreakView()
export const showSummaryView = () => windowManager.showSummaryView()
export const closeAllWindows = () => windowManager.closeAllWindows()
export const isOverlayShowing = () => windowManager.isShowing()
