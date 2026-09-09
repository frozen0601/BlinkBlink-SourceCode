import { describe, expect, it } from 'vitest'
import { isNewerVersion, parseVersion, pickAssetForArch, pickLatestRelease, ReleaseSummary } from '../src/core/update'

const asset = (name: string) => ({ name, browser_download_url: `https://example.test/${name}` })

const release = (tag: string, extra: Partial<ReleaseSummary> = {}): ReleaseSummary => ({
    tag_name: tag,
    draft: false,
    prerelease: false,
    published_at: '2026-01-01T00:00:00Z',
    assets: [],
    ...extra,
})

describe('parseVersion', () => {
    it('accepts tags with and without a leading v', () => {
        expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
        expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
        expect(parseVersion('v0.1.3-beta.1')).toEqual([0, 1, 3])
    })

    it('rejects anything unparseable', () => {
        expect(parseVersion('latest')).toBeNull()
        expect(parseVersion('')).toBeNull()
        expect(parseVersion('v1.2')).toBeNull()
    })
})

describe('isNewerVersion', () => {
    it('compares numerically, not as strings', () => {
        // The string comparison this replaces put 0.9.0 above 0.10.0.
        expect(isNewerVersion('0.10.0', '0.9.0')).toBe(true)
        expect(isNewerVersion('0.9.0', '0.10.0')).toBe(false)
        expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true)
    })

    it('is false for the same version', () => {
        expect(isNewerVersion('0.1.3', '0.1.3')).toBe(false)
        expect(isNewerVersion('v0.1.3', '0.1.3')).toBe(false)
    })

    it('is false when either side is unparseable', () => {
        expect(isNewerVersion('nightly', '0.1.3')).toBe(false)
        expect(isNewerVersion('0.2.0', 'unknown')).toBe(false)
    })
})

describe('pickLatestRelease', () => {
    it('picks the highest version, not the most recently published', () => {
        const releases = [
            release('v0.1.3', { published_at: '2026-05-01T00:00:00Z' }),
            release('v0.2.0', { published_at: '2026-01-01T00:00:00Z' }),
        ]
        // Re-publishing an old release must not advertise it as an update.
        expect(pickLatestRelease(releases)?.tag_name).toBe('v0.2.0')
    })

    it('ignores drafts and prereleases', () => {
        const releases = [release('v0.3.0', { draft: true }), release('v0.2.9', { prerelease: true }), release('v0.2.0')]
        expect(pickLatestRelease(releases)?.tag_name).toBe('v0.2.0')
    })

    it('returns null when nothing is usable', () => {
        expect(pickLatestRelease([])).toBeNull()
        expect(pickLatestRelease([release('v1.0.0', { draft: true })])).toBeNull()
    })
})

describe('pickAssetForArch', () => {
    const macAssets = [asset('BlinkBlink-0.2.0-arm64.dmg'), asset('BlinkBlink-0.2.0-x64.dmg'), asset('BlinkBlink-0.2.0-arm64.zip')]

    it('matches the architecture rather than the first file of the right type', () => {
        // Handing an arm64 build to an Intel Mac produces an app that will not
        // launch at all, so this is the case that matters most.
        expect(pickAssetForArch(macAssets, '.dmg', 'x64')?.name).toBe('BlinkBlink-0.2.0-x64.dmg')
        expect(pickAssetForArch(macAssets, '.dmg', 'arm64')?.name).toBe('BlinkBlink-0.2.0-arm64.dmg')
    })

    it('respects the extension', () => {
        expect(pickAssetForArch(macAssets, '.zip', 'arm64')?.name).toBe('BlinkBlink-0.2.0-arm64.zip')
    })

    it('falls back to an unsuffixed asset from an older release', () => {
        const legacy = [asset('BlinkBlink.Setup.0.1.3.dmg')]
        expect(pickAssetForArch(legacy, '.dmg', 'arm64')?.name).toBe('BlinkBlink.Setup.0.1.3.dmg')
    })

    it('prefers an unsuffixed asset over one for the wrong architecture', () => {
        const mixed = [asset('BlinkBlink-0.2.0-arm64.dmg'), asset('BlinkBlink-universal.dmg')]
        expect(pickAssetForArch(mixed, '.dmg', 'x64')?.name).toBe('BlinkBlink-universal.dmg')
    })

    it('returns null when the release has nothing of that type', () => {
        expect(pickAssetForArch(macAssets, '.exe', 'x64')).toBeNull()
        expect(pickAssetForArch([], '.dmg', 'x64')).toBeNull()
    })

    it('is not confused by a version number containing the arch string', () => {
        const tricky = [asset('BlinkBlink-1.64.0-arm64.dmg'), asset('BlinkBlink-1.64.0-x64.dmg')]
        expect(pickAssetForArch(tricky, '.dmg', 'x64')?.name).toBe('BlinkBlink-1.64.0-x64.dmg')
    })
})
