import { describe, expect, it } from 'vitest'
// `main/cli.ts` imports nothing from Electron, which is what lets it be tested
// here alongside the core modules.
import { parseArgv } from '../src/main/cli'

describe('parseArgv', () => {
    it('reads the window flags', () => {
        expect(parseArgv(['--take-break']).takeBreak).toBe(true)
        expect(parseArgv(['--settings']).openSettings).toBe(true)
        expect(parseArgv(['--stats']).openStats).toBe(true)
        expect(parseArgv(['--hidden']).hidden).toBe(true)
    })

    it('is nothing at all for a bare launch', () => {
        expect(parseArgv(['/usr/bin/blinkblink'])).toEqual({
            takeBreak: false,
            openSettings: false,
            openStats: false,
            hidden: false,
            tryInstall: null,
        })
    })

    describe('--try-install', () => {
        it('takes the path as a separate argument or after an equals sign', () => {
            expect(parseArgv(['--try-install', '/tmp/BlinkBlink.dmg']).tryInstall).toBe('/tmp/BlinkBlink.dmg')
            expect(parseArgv(['--try-install=/tmp/BlinkBlink.dmg']).tryInstall).toBe('/tmp/BlinkBlink.dmg')
        })

        it('keeps an equals sign that is part of the path', () => {
            expect(parseArgv(['--try-install=/tmp/a=b.dmg']).tryInstall).toBe('/tmp/a=b.dmg')
        })

        it('is null when no path follows, rather than swallowing the next flag', () => {
            expect(parseArgv(['--try-install']).tryInstall).toBeNull()
            expect(parseArgv(['--try-install', '--hidden']).tryInstall).toBeNull()
            expect(parseArgv(['--try-install', '--hidden']).hidden).toBe(true)
        })

        // The other flags are matched case-insensitively; a filesystem path is
        // not, so this one is read off the original argv.
        it('does not lowercase the path', () => {
            expect(parseArgv(['--try-install', '/Users/Me/Downloads/BlinkBlink.dmg']).tryInstall).toBe('/Users/Me/Downloads/BlinkBlink.dmg')
        })
    })
})
