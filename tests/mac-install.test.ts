import { describe, expect, it } from 'vitest'
import { checkDownloadedBundle, planInPlaceInstall, readPlistString, retiredPath, stagingPath } from '../src/core/macInstall'
import { isNewerVersion } from '../src/core/update'

const plist = (values: Record<string, string>) =>
    `<?xml version="1.0"?><plist><dict>${Object.entries(values)
        .map(([key, value]) => `<key>${key}</key><string>${value}</string>`)
        .join('')}</dict></plist>`

describe('planInPlaceInstall', () => {
    it('replaces a packaged bundle', () => {
        expect(planInPlaceInstall('/Applications/BlinkBlink.app', true)).toEqual({
            kind: 'replace',
            bundlePath: '/Applications/BlinkBlink.app',
        })
    })

    it('replaces one installed somewhere other than /Applications', () => {
        // Plenty of people keep apps in ~/Applications, and the swap is the
        // same two renames wherever the bundle lives.
        expect(planInPlaceInstall('/Users/x/Applications/BlinkBlink.app', true).kind).toBe('replace')
    })

    it('refuses a development build, which has no bundle to swap', () => {
        expect(planInPlaceInstall('/Users/x/code/blinkblink', false).kind).toBe('manual')
    })

    it('refuses anything that is not a bundle', () => {
        expect(planInPlaceInstall('/Applications/BlinkBlink', true).kind).toBe('manual')
    })

    it('refuses an app running from the disk image it arrived in', () => {
        // Nothing is installed yet, and the mount is read-only either way.
        expect(planInPlaceInstall('/Volumes/BlinkBlink 0.2.5/BlinkBlink.app', true).kind).toBe('manual')
    })
})

describe('readPlistString', () => {
    it('reads a value by key', () => {
        expect(readPlistString(plist({ CFBundleIdentifier: 'blinkblink' }), 'CFBundleIdentifier')).toBe('blinkblink')
    })

    it('is null for a key that is not there', () => {
        expect(readPlistString(plist({}), 'CFBundleIdentifier')).toBeNull()
    })
})

describe('checkDownloadedBundle', () => {
    const good = plist({ CFBundleIdentifier: 'blinkblink', CFBundleShortVersionString: '0.2.5' })

    it('accepts the app it expected, at a newer version', () => {
        expect(checkDownloadedBundle(good, 'blinkblink', '0.2.4', isNewerVersion).ok).toBe(true)
    })

    it('refuses a different app', () => {
        // The swap is irreversible from the user's side, so a surprise here
        // stops everything rather than being coped with.
        const other = plist({ CFBundleIdentifier: 'com.example.other', CFBundleShortVersionString: '9.0.0' })
        expect(checkDownloadedBundle(other, 'blinkblink', '0.2.4', isNewerVersion)).toMatchObject({ ok: false })
    })

    it('refuses a version that is not newer', () => {
        expect(checkDownloadedBundle(good, 'blinkblink', '0.2.5', isNewerVersion).ok).toBe(false)
        expect(checkDownloadedBundle(good, 'blinkblink', '0.3.0', isNewerVersion).ok).toBe(false)
    })

    it('refuses a bundle it cannot read', () => {
        expect(checkDownloadedBundle('not a plist', 'blinkblink', '0.2.4', isNewerVersion).ok).toBe(false)
        expect(checkDownloadedBundle(plist({ CFBundleIdentifier: 'blinkblink' }), 'blinkblink', '0.2.4', isNewerVersion).ok).toBe(false)
    })
})

describe('the swap paths', () => {
    it('stage and retire beside the bundle, so the swap is a rename', () => {
        // A staging directory on another volume would make the final move a
        // copy: slow, and no longer atomic.
        expect(stagingPath('/Applications/BlinkBlink.app', '42')).toBe('/Applications/BlinkBlink.app.new-42')
        expect(retiredPath('/Applications/BlinkBlink.app', '42')).toBe('/Applications/BlinkBlink.app.old-42')
    })

    it('never collides with the bundle itself', () => {
        const bundle = '/Applications/BlinkBlink.app'
        expect(stagingPath(bundle, '42')).not.toBe(bundle)
        expect(retiredPath(bundle, '42')).not.toBe(stagingPath(bundle, '42'))
    })
})
