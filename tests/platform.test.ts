import { describe, expect, it } from 'vitest'
import {
    backdropNeedsTransparentWindow,
    resolveAutostartMechanism,
    overlayBypassesWindowManager,
    resolveBackdropMode,
    resolveUpdateDelivery,
    supportsNotificationActions,
    supportsWindowsAcrylic,
    windowsBuildNumber,
    WINDOWS_ACRYLIC_MIN_BUILD,
} from '../src/core/platform'

const facts = (platform: string, release = '0.0.0', extra: Record<string, unknown> = {}) => ({ platform, release, ...extra })

describe('windowsBuildNumber', () => {
    it('reads the build out of an os.release() string', () => {
        expect(windowsBuildNumber('10.0.22631')).toBe(22631)
        expect(windowsBuildNumber('10.0.19045')).toBe(19045)
    })

    it('is zero for anything unparseable', () => {
        expect(windowsBuildNumber('')).toBe(0)
        expect(windowsBuildNumber('6.1')).toBe(0)
    })
})

describe('supportsWindowsAcrylic', () => {
    it('requires Windows 11 22H2 or newer', () => {
        expect(supportsWindowsAcrylic(facts('win32', `10.0.${WINDOWS_ACRYLIC_MIN_BUILD}`))).toBe(true)
        expect(supportsWindowsAcrylic(facts('win32', '10.0.22000'))).toBe(false)
        expect(supportsWindowsAcrylic(facts('win32', '10.0.19045'))).toBe(false)
    })

    it('is false off Windows', () => {
        expect(supportsWindowsAcrylic(facts('darwin', '23.0.0'))).toBe(false)
    })
})

describe('resolveBackdropMode', () => {
    it('uses native vibrancy on macOS', () => {
        expect(resolveBackdropMode(facts('darwin', '23.0.0'))).toBe('vibrancy')
    })

    it('uses acrylic on Windows 11 22H2+ and a scrim below that', () => {
        expect(resolveBackdropMode(facts('win32', '10.0.22631'))).toBe('acrylic')
        // Regression guard: Windows 10 has no DWM material, and asking for one
        // left the window painted opaque white.
        expect(resolveBackdropMode(facts('win32', '10.0.19045'))).toBe('translucent')
    })

    it('uses a scrim on Linux', () => {
        expect(resolveBackdropMode(facts('linux', '6.8.0'))).toBe('translucent')
    })

    it('lets the user force a mode', () => {
        expect(resolveBackdropMode(facts('darwin', '23.0.0'), 'solid')).toBe('solid')
        expect(resolveBackdropMode(facts('win32', '10.0.22631'), 'translucent')).toBe('translucent')
    })

    it('falls back to solid on unknown platforms', () => {
        expect(resolveBackdropMode(facts('freebsd', '14.0'))).toBe('solid')
    })
})

describe('backdropNeedsTransparentWindow', () => {
    it('is true only for the modes that composite with the desktop', () => {
        expect(backdropNeedsTransparentWindow('vibrancy')).toBe(true)
        expect(backdropNeedsTransparentWindow('translucent')).toBe(true)
        // Acrylic is drawn by DWM behind an opaque-flagged window.
        expect(backdropNeedsTransparentWindow('acrylic')).toBe(false)
        expect(backdropNeedsTransparentWindow('solid')).toBe(false)
    })
})

describe('resolveAutostartMechanism', () => {
    it('uses the OS login item on macOS and Windows', () => {
        expect(resolveAutostartMechanism(facts('darwin'))).toBe('login-item')
        expect(resolveAutostartMechanism(facts('win32'))).toBe('login-item')
    })

    it('writes an XDG autostart entry on Linux', () => {
        // setLoginItemSettings is a no-op on Linux, which is why the checkbox
        // used to do nothing there.
        expect(resolveAutostartMechanism(facts('linux'))).toBe('xdg-autostart')
    })

    it('is unsupported inside a snap, which cannot write to the host', () => {
        expect(resolveAutostartMechanism(facts('linux', '6.8.0', { isSnap: true }))).toBe('unsupported')
    })
})

describe('supportsNotificationActions', () => {
    it('requires a signed app on macOS', () => {
        expect(supportsNotificationActions(facts('darwin'), false)).toBe(false)
        expect(supportsNotificationActions(facts('darwin'), true)).toBe(true)
    })

    it('does not on Windows or Linux', () => {
        expect(supportsNotificationActions(facts('win32'), false)).toBe(true)
        expect(supportsNotificationActions(facts('linux'), false)).toBe(true)
    })
})

describe('overlayBypassesWindowManager', () => {
    it('is Linux only', () => {
        // The overlay is in the KDE task switcher otherwise, and Electron has no
        // way to set the atom KWin reads. Bypassing window management is the
        // only lever; macOS and Windows do not need it and would lose focus
        // behaviour they rely on.
        expect(overlayBypassesWindowManager(facts('linux'))).toBe(true)
        expect(overlayBypassesWindowManager(facts('darwin'))).toBe(false)
        expect(overlayBypassesWindowManager(facts('win32'))).toBe(false)
    })
})

describe('resolveUpdateDelivery', () => {
    it('installs in place on Windows and on an AppImage', () => {
        expect(resolveUpdateDelivery(facts('win32'))).toBe('in-app')
        expect(resolveUpdateDelivery(facts('linux', '0.0.0', { isAppImage: true }))).toBe('in-app')
    })

    it('gets as far as the DMG on macOS', () => {
        expect(resolveUpdateDelivery(facts('darwin'))).toBe('assisted')
    })

    it('leaves snap, deb and rpm to whatever installed them', () => {
        expect(resolveUpdateDelivery(facts('linux'))).toBe('external')
        expect(resolveUpdateDelivery(facts('linux', '0.0.0', { isSnap: true }))).toBe('external')
    })

    it('never assumes an unknown platform can update itself', () => {
        expect(resolveUpdateDelivery(facts('freebsd'))).toBe('external')
    })
})
