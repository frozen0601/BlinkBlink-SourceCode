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

import { BrowserWindow, globalShortcut, screen } from 'electron'
import * as path from 'path'
import { getBreakDuration, getSettings } from './store'
import { handleBreakComplete, handleBreakSkip, handleSummaryDismissed } from './controller'
import { getBackdropMode, isLinux, isMac, isWindows, overlayShouldBypassWm } from './platform'
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
    #escapeBound = false
    #countdownInterval?: NodeJS.Timeout
    /** When the running countdown ends, or null when none is running. */
    #countdownEndsAt: number | null = null
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
        this.#releaseEscape()
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

        this.#bindEscape()

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
            // Linux asks for real full screen after showing (see below); macOS
            // must not, because its full screen means a new Space.
            fullscreenable: isLinux,
            // Linux only: keeps the break screen out of the task switcher, at
            // the cost of keyboard focus. `#bindEscape` buys that back.
            ...(overlayShouldBypassWm() ? { focusable: false } : {}),
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

            if (isLinux) {
                // Screen-sized and always-on-top is not the same thing as full
                // screen to a Linux window manager: a panel set to stay visible
                // sits in its own layer and keeps a strip of the desktop, which
                // is what left the Plasma taskbar showing over the break.
                // _NET_WM_STATE_FULLSCREEN is the request every desktop
                // understands, and the bounds above remain the fallback if the
                // compositor refuses it.
                window.setFullScreen(true)
            }

            // A countdown that started while this window was still loading
            // never reached it — `webContents.send` to an unloaded renderer is
            // dropped. Catch the window up with the time that is actually left,
            // so its progress bar animates over the correct remainder.
            this.#sendCountdownState(window)
        })
    }

    /**
     * Escape, for a window that cannot receive key events.
     *
     * A window outside window management never takes focus, so the overlay's own
     * keydown handler never fires on Linux. A global shortcut does the same job
     * for exactly as long as the overlay is up: registered when it opens,
     * released when it closes, so nothing else on the system loses Escape.
     *
     * Registration can fail if another application already holds the key. The
     * on-screen Skip button is the fallback, which is why this warns rather than
     * refusing to show the break.
     */
    #bindEscape(): void {
        if (!overlayShouldBypassWm() || this.#escapeBound) return

        this.#escapeBound = globalShortcut.register('Escape', () => this.#handleEscape())
        if (!this.#escapeBound) {
            console.warn('[overlay] could not register Escape; the break can still be dismissed with the button')
        }
    }

    #releaseEscape(): void {
        if (!this.#escapeBound) return
        globalShortcut.unregister('Escape')
        this.#escapeBound = false
    }

    /** Mirrors what the renderer does with Escape on the platforms that get it. */
    #handleEscape(): void {
        if (this.#activeConfig?.type === 'summary') handleSummaryDismissed()
        else if (this.#activeConfig?.type === 'break') handleBreakSkip()
    }

    /** Brings one window up to date with the countdown already in progress. */
    #sendCountdownState(window: BrowserWindow): void {
        if (this.#countdownEndsAt === null || window.isDestroyed()) return

        const remainingMs = this.#countdownEndsAt - Date.now()
        if (remainingMs <= 0) return

        window.webContents.send('start-countdown', remainingMs)
        window.webContents.send('countdown-update', Math.ceil(remainingMs / 1000))
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
        // Recorded on the instance so a window that finishes loading mid-count
        // can be caught up; see #sendCountdownState.
        this.#countdownEndsAt = Date.now() + config.durationMs

        this.#broadcast('start-countdown', config.durationMs)
        this.#broadcast('countdown-update', Math.ceil(config.durationMs / 1000))

        this.#countdownInterval = setInterval(() => {
            const remainingMs = (this.#countdownEndsAt ?? 0) - Date.now()

            if (remainingMs <= 0) {
                this.#stopCountdown()
                config.onComplete()
                return
            }

            this.#broadcast('countdown-update', Math.ceil(remainingMs / 1000))
        }, 250)
    }

    #stopCountdown(): void {
        this.#countdownEndsAt = null
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
