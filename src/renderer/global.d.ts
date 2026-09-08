/**
 * The single declaration of `window.api` for every renderer.
 *
 * Typed straight from the preload's exported shape, so the bridge and its
 * consumers cannot drift apart: removing a method from the preload becomes a
 * compile error in the pages that used it.
 */

import type { BlinkBlinkApi } from '../main/preload'

declare global {
    interface Window {
        api: BlinkBlinkApi
    }
}

export {}
