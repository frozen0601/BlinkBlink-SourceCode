import { expect, test } from '@playwright/test'
import { launchApp, LaunchedApp, waitForWindow } from './helpers'

/*
 * The bundled sounds are Ogg Opus rather than WAV, which only pays off if
 * Electron's Chromium can decode them from a `file://` URL under the window's
 * CSP. Nothing in the unit tests can tell: they see a filename, not a decoder.
 *
 * Decoding is asserted rather than playback, because a headless runner has no
 * audio device to play to. Reading a real duration off the file proves the
 * codec is understood, which is the part that would break.
 */

let launched: LaunchedApp

test.afterEach(async () => {
    await launched?.close()
})

test('the bundled sounds are listed and decode in the renderer', async () => {
    launched = await launchApp({ args: ['--settings'] })
    const settings = await waitForWindow(launched.app, 'settings.html')

    const sounds: { filename: string; name: string }[] = await settings.evaluate(() => window.api.getAvailableSounds())
    expect(sounds.length).toBeGreaterThan(0)
    expect(sounds.every((sound) => sound.filename.endsWith('.opus'))).toBe(true)

    const decoded = await settings.evaluate(async () => {
        const path = await window.api.getSoundPath('bling.opus')
        if (!path) return { error: 'no path' }

        const audio = new Audio(`file://${path}`)
        await new Promise<void>((resolve, reject) => {
            audio.addEventListener('loadedmetadata', () => resolve(), { once: true })
            audio.addEventListener('error', () => reject(new Error(`media error ${audio.error?.code}`)), { once: true })
            setTimeout(() => reject(new Error('timed out loading the sound')), 10_000)
        })
        return { duration: audio.duration, canPlay: audio.canPlayType('audio/ogg; codecs=opus') }
    })

    expect(decoded.error).toBeUndefined()
    expect(decoded.canPlay).toBe('probably')
    expect(decoded.duration).toBeGreaterThan(0)
})

test('a sound chosen before 0.2.4 still resolves to a real file', async () => {
    // The store holds the filename, so an upgrade meets `.wav` names that no
    // longer exist on disk.
    launched = await launchApp({ args: ['--settings'], settings: { notificationSound: 'neigh.wav' } })
    const settings = await waitForWindow(launched.app, 'settings.html')

    expect(await settings.evaluate(() => window.api.getSettings())).toMatchObject({ notificationSound: 'neigh.opus' })
    expect(await settings.evaluate(() => window.api.getSoundPath('neigh.wav'))).toContain('neigh.opus')
})
