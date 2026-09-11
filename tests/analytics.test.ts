import { describe, expect, it } from 'vitest'
import { buildAppStartedEvent, isAnalyticsEnabled } from '../src/core/analytics'
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/core/settings'
import { Settings } from '../src/core/types'

const settings = (overrides: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...overrides })

const input = (overrides: Partial<Settings> = {}) => ({
    settings: settings(overrides),
    platform: 'darwin',
    arch: 'arm64',
    version: '0.2.0',
    firstRun: false,
})

describe('isAnalyticsEnabled', () => {
    it('is on by default', () => {
        expect(isAnalyticsEnabled(DEFAULT_SETTINGS)).toBe(true)
    })

    it('is off once the user opts out', () => {
        expect(isAnalyticsEnabled(settings({ enableAnalytics: false }))).toBe(false)
    })
})

describe('buildAppStartedEvent', () => {
    it('sends nothing at all for an opted-out user', () => {
        expect(buildAppStartedEvent({ ...input(), settings: settings({ enableAnalytics: false }) })).toBeNull()
    })

    it('reports platform, version and whether this is a first run', () => {
        const event = buildAppStartedEvent({ ...input(), firstRun: true })
        expect(event?.name).toBe('app_started')
        expect(event?.props.platform).toBe('darwin')
        expect(event?.props.version).toBe('0.2.0')
        expect(event?.props.first_run).toBe(1)
    })

    it('reports the architecture, which is what counts Intel Macs', () => {
        // A universal build reports the slice it is running as, so an Intel Mac
        // running the universal DMG sends x64 rather than "universal".
        expect(buildAppStartedEvent({ ...input(), arch: 'x64' })?.props.arch).toBe('x64')
        expect(buildAppStartedEvent(input())?.props.arch).toBe('arm64')
    })

    it('distinguishes a returning launch from a first run', () => {
        expect(buildAppStartedEvent(input())?.props.first_run).toBe(0)
    })

    it('sends booleans as 0/1 so Aptabase can average them', () => {
        const event = buildAppStartedEvent(input({ startOnBoot: true, autoUpdate: false }))
        expect(event?.props.start_on_boot).toBe(1)
        expect(event?.props.auto_update).toBe(0)
    })

    it('folds the settings distribution in as properties rather than a second event', () => {
        const event = buildAppStartedEvent(input({ reminderStyle: 'in-app', overlayBackdrop: 'solid' }))
        expect(event?.props.reminder_style).toBe('in-app')
        expect(event?.props.overlay_backdrop).toBe('solid')
    })

    it('reports durations in human units rather than milliseconds', () => {
        const event = buildAppStartedEvent(input({ workDuration: 25 * 60000, breakDuration: 30 * 1000 }))
        expect(event?.props.work_minutes).toBe(25)
        expect(event?.props.break_seconds).toBe(30)
    })

    it('carries only flat scalars, since Aptabase renders nothing else', () => {
        const event = buildAppStartedEvent(input())
        for (const [key, value] of Object.entries(event?.props ?? {})) {
            expect(['string', 'number'], `${key} is neither a string nor a number`).toContain(typeof value)
        }
    })

    it('stays one event per launch — the budget the whole design exists for', () => {
        // A guard against someone adding a second call site later: the shape of
        // this module is one event, and per-break events are what blew the free
        // tier in 0.1.2.
        expect(buildAppStartedEvent(input())?.name).toBe('app_started')
    })
})

describe('the opt-out survives the store', () => {
    it('defaults to on for a store written before the setting existed', () => {
        const withoutTheKey: Record<string, unknown> = { ...DEFAULT_SETTINGS }
        delete withoutTheKey.enableAnalytics
        expect(normalizeSettings(withoutTheKey).enableAnalytics).toBe(true)
    })

    it('keeps an explicit opt-out across a round trip through normalisation', () => {
        expect(normalizeSettings({ ...DEFAULT_SETTINGS, enableAnalytics: false }).enableAnalytics).toBe(false)
    })

    it('does not let a malformed stored value silently opt someone back in', () => {
        // `toBoolean` falls back to the default for anything non-boolean, so a
        // corrupted value reads as on. Pinned here so the choice is deliberate.
        expect(normalizeSettings({ ...DEFAULT_SETTINGS, enableAnalytics: 'nonsense' }).enableAnalytics).toBe(true)
    })
})
