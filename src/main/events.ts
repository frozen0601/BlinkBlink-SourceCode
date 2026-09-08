/**
 * A tiny typed event bus for the main process.
 *
 * The timer needs to open the break overlay, the overlay's outcome feeds back
 * into the timer, and the tray reflects both. Wiring those together with direct
 * imports produces a cycle, which the previous code worked around by
 * re-purposing `ipcMain.emit` as an in-process bus — that made every internal
 * signal indistinguishable from a message sent by a renderer. This bus keeps
 * the modules decoupled without borrowing the IPC channel.
 */

import { EventEmitter } from 'events'

export interface AppEventMap {
    /** A break is due now. */
    'break-due': []
    /** The pre-break reminder should be shown. */
    'reminder-due': [{ breakAt: Date }]
    /** Timer state changed; anything displaying it should refresh. */
    'timer-changed': []
}

type EventName = keyof AppEventMap

class TypedEmitter {
    #emitter = new EventEmitter()

    constructor() {
        // The tray, overlay and timer can legitimately all listen to the same
        // signal; the default limit of 10 is a memory-leak heuristic, not a
        // budget, but keeping it generous avoids spurious warnings.
        this.#emitter.setMaxListeners(32)
    }

    on<E extends EventName>(event: E, listener: (...args: AppEventMap[E]) => void): void {
        this.#emitter.on(event, listener as (...args: unknown[]) => void)
    }

    off<E extends EventName>(event: E, listener: (...args: AppEventMap[E]) => void): void {
        this.#emitter.off(event, listener as (...args: unknown[]) => void)
    }

    emit<E extends EventName>(event: E, ...args: AppEventMap[E]): void {
        this.#emitter.emit(event, ...args)
    }

    removeAllListeners(): void {
        this.#emitter.removeAllListeners()
    }
}

export const appEvents = new TypedEmitter()
