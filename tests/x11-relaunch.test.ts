import { describe, expect, it } from 'vitest'
import { RELAUNCH_MARKER, childArguments, childEnvironment, shouldRelaunchOntoX11 } from '../src/core/x11Relaunch'

const facts = (extra: Record<string, unknown> = {}) => ({
    platform: 'linux',
    waylandDisplay: 'wayland-0',
    display: ':0',
    argv: ['/usr/bin/blinkblink'],
    ...extra,
})

describe('shouldRelaunchOntoX11', () => {
    it('relaunches a Wayland session that has XWayland to land on', () => {
        expect(shouldRelaunchOntoX11(facts())).toBe(true)
    })

    it('leaves an X11 session alone', () => {
        expect(shouldRelaunchOntoX11(facts({ waylandDisplay: undefined }))).toBe(false)
    })

    it('will not strand the app where there is no X server', () => {
        // Forcing the backend with nothing to land on means an app that does
        // not start at all, which is worse than one listed in alt-tab.
        expect(shouldRelaunchOntoX11(facts({ display: undefined }))).toBe(false)
    })

    it('is Linux only', () => {
        expect(shouldRelaunchOntoX11(facts({ platform: 'darwin' }))).toBe(false)
        expect(shouldRelaunchOntoX11(facts({ platform: 'win32' }))).toBe(false)
    })

    describe('never twice', () => {
        it('stops on the marker the child is given', () => {
            expect(shouldRelaunchOntoX11(facts({ marker: '1' }))).toBe(false)
        })

        it('stops on the backend already being on the command line', () => {
            expect(shouldRelaunchOntoX11(facts({ argv: ['/usr/bin/blinkblink', '--ozone-platform=x11'] }))).toBe(false)
        })

        // Two independent guards, because this loop would be a process fork
        // bomb rather than a mere bug.
        it('holds when either guard is present on its own', () => {
            expect(shouldRelaunchOntoX11(facts({ marker: '1', argv: ['/usr/bin/blinkblink'] }))).toBe(false)
            expect(shouldRelaunchOntoX11(facts({ marker: undefined, argv: ['/usr/bin/blinkblink', '--ozone-platform=wayland'] }))).toBe(
                false
            )
        })
    })

    it('yields to a backend asked for explicitly, which is the way back to Wayland', () => {
        expect(shouldRelaunchOntoX11(facts({ ozoneHint: 'auto' }))).toBe(false)
        expect(shouldRelaunchOntoX11(facts({ argv: ['/usr/bin/blinkblink', '--ozone-platform=wayland'] }))).toBe(false)
    })
})

describe('childEnvironment', () => {
    const appDir = '/tmp/.mount_Blink1234'

    it('drops the variables that only mean something inside the mount', () => {
        const env = childEnvironment({ APPDIR: appDir, APPIMAGE: '/home/me/BlinkBlink.AppImage', ARGV0: 'x', OWD: '/home/me' }, appDir)

        expect(env.APPDIR).toBeUndefined()
        expect(env.APPIMAGE).toBeUndefined()
        expect(env.ARGV0).toBeUndefined()
        expect(env.OWD).toBeUndefined()
    })

    it('takes the mount out of a path list but keeps the system entries', () => {
        // This is the whole point: the child inheriting a library path into the
        // parent's mount is what killed it with SIGBUS once the parent exited.
        const env = childEnvironment(
            { LD_LIBRARY_PATH: `${appDir}/usr/lib:/usr/lib64:${appDir}/usr/lib/x`, PATH: `${appDir}/usr/bin:/usr/bin` },
            appDir
        )

        expect(env.LD_LIBRARY_PATH).toBe('/usr/lib64')
        expect(env.PATH).toBe('/usr/bin')
    })

    it('catches a stale mount from an earlier run, with no APPDIR to go on', () => {
        const env = childEnvironment({ LD_LIBRARY_PATH: '/tmp/.mount_Blink9999/usr/lib:/usr/lib64' })
        expect(env.LD_LIBRARY_PATH).toBe('/usr/lib64')
    })

    it('drops a path list that empties out rather than setting it to nothing', () => {
        // An empty LD_LIBRARY_PATH is read by some loaders as "look in the
        // current directory", which is worse than having no value at all.
        const env = childEnvironment({ LD_LIBRARY_PATH: `${appDir}/usr/lib` }, appDir)
        expect('LD_LIBRARY_PATH' in env).toBe(false)
    })

    it('does not let a directory prefix swallow its siblings', () => {
        // An extracted AppImage can set APPDIR to an ordinary directory, and
        // `/opt/blink` must not take `/opt/blink-other` with it.
        const env = childEnvironment({ PATH: '/opt/blink/bin:/opt/blink-other/bin:/usr/bin' }, '/opt/blink')
        expect(env.PATH).toBe('/opt/blink-other/bin:/usr/bin')
    })

    it('leaves everything else exactly as it was', () => {
        const env = childEnvironment({ HOME: '/home/me', WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0', XDG_SESSION_TYPE: 'wayland' })

        expect(env.HOME).toBe('/home/me')
        expect(env.DISPLAY).toBe(':0')
        // Left in deliberately: the child is told which backend to use on its
        // command line, and the session is still a Wayland one.
        expect(env.WAYLAND_DISPLAY).toBe('wayland-0')
        expect(env.XDG_SESSION_TYPE).toBe('wayland')
    })

    it('marks the child so it can never relaunch in turn', () => {
        expect(childEnvironment({})[RELAUNCH_MARKER]).toBe('1')
    })

    it('skips variables that are not set', () => {
        expect('NOPE' in childEnvironment({ NOPE: undefined })).toBe(false)
    })
})

describe('childArguments', () => {
    it('keeps the original arguments and names the backend', () => {
        expect(childArguments(['/usr/bin/blinkblink', '--hidden'])).toEqual(['--hidden', '--ozone-platform=x11'])
    })

    it('drops argv[0], which is the executable rather than an argument', () => {
        expect(childArguments(['/usr/bin/blinkblink'])).toEqual(['--ozone-platform=x11'])
    })
})
