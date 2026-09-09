/** Locating the bundled notification sounds. */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { normalizeSoundName } from '../core/settings'

const DEFAULT_SOUND = 'bling.wav'

export function getSoundsPath(): string {
    // Packaged builds copy `assets/` into the app's resources directory.
    return app.isPackaged ? path.join(process.resourcesPath, 'assets', 'sounds') : path.join(__dirname, '..', 'assets', 'sounds')
}

/**
 * Resolves a stored sound preference to an absolute path.
 *
 * Returns `null` for anything that does not resolve to a real file inside the
 * bundled sounds directory — the value reaches here from the renderer, so it is
 * re-validated rather than trusted, and the containment check is belt and
 * braces on top of the filename whitelist.
 */
export function getSoundPath(soundValue: unknown): string | null {
    const safeName = normalizeSoundName(soundValue, DEFAULT_SOUND)
    const filename = safeName === 'system' ? DEFAULT_SOUND : safeName

    const soundsDir = getSoundsPath()
    const resolved = path.resolve(soundsDir, filename)
    if (path.dirname(resolved) !== path.resolve(soundsDir)) return null
    if (!fs.existsSync(resolved)) return null

    return resolved
}

export interface AvailableSound {
    filename: string
    name: string
}

export function getAvailableSounds(): AvailableSound[] {
    try {
        return fs
            .readdirSync(getSoundsPath())
            .filter((file) => file.endsWith('.wav'))
            .sort((a, b) => a.localeCompare(b))
            .map((file) => ({
                filename: file,
                name: file
                    .replace(/\.wav$/, '')
                    .replace(/[-_]/g, ' ')
                    .replace(/\b\w/g, (character) => character.toUpperCase()),
            }))
    } catch (error) {
        console.error('[sound] could not list the bundled sounds:', error)
        return []
    }
}
