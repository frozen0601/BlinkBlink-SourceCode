import { describe, expect, it } from 'vitest'
import {
    DEFAULT_SETTINGS,
    MINUTE,
    normalizeSchedule,
    normalizeSettings,
    normalizeSoundName,
    normalizeStats,
    SECOND,
    SETTINGS_LIMITS,
} from '../src/core/settings'

describe('normalizeSettings', () => {
    it('returns the defaults for junk input', () => {
        expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
        expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
        expect(normalizeSettings(42)).toEqual(DEFAULT_SETTINGS)
    })

    it('keeps unspecified fields from the base settings', () => {
        const base = { ...DEFAULT_SETTINGS, workDuration: 45 * MINUTE }
        expect(normalizeSettings({ enableSoundNotification: false }, base).workDuration).toBe(45 * MINUTE)
    })

    it('clamps a zero work duration, which would otherwise spin the overlay', () => {
        expect(normalizeSettings({ workDuration: 0 }).workDuration).toBe(SETTINGS_LIMITS.workDuration.min)
    })

    it('clamps an absurd work duration', () => {
        expect(normalizeSettings({ workDuration: 999 * MINUTE }).workDuration).toBe(SETTINGS_LIMITS.workDuration.max)
    })

    it('coerces numeric strings, as the settings form sends them', () => {
        expect(normalizeSettings({ workDuration: '1200000' as unknown as number }).workDuration).toBe(20 * MINUTE)
    })

    it('rejects NaN and Infinity', () => {
        expect(normalizeSettings({ breakDuration: Number.NaN }).breakDuration).toBe(DEFAULT_SETTINGS.breakDuration)
        expect(normalizeSettings({ breakDuration: Number.POSITIVE_INFINITY }).breakDuration).toBe(DEFAULT_SETTINGS.breakDuration)
    })

    it('keeps the reminder offset inside the work interval', () => {
        // A 1 minute work interval cannot carry a 10 minute pre-warning.
        const settings = normalizeSettings({ workDuration: 1 * MINUTE, breakPreNotificationOffset: 10 * MINUTE })
        expect(settings.breakPreNotificationOffset).toBeLessThan(settings.workDuration)
    })

    it('ignores unknown enum values', () => {
        expect(normalizeSettings({ reminderStyle: 'carrier-pigeon' as never }).reminderStyle).toBe(DEFAULT_SETTINGS.reminderStyle)
        expect(normalizeSettings({ overlayBackdrop: 'rainbow' as never }).overlayBackdrop).toBe(DEFAULT_SETTINGS.overlayBackdrop)
    })

    it('ignores non-boolean values for toggles', () => {
        expect(normalizeSettings({ startOnBoot: 'yes' as unknown as boolean }).startOnBoot).toBe(DEFAULT_SETTINGS.startOnBoot)
    })
})

describe('normalizeSoundName', () => {
    it('accepts bundled wav filenames and the system default', () => {
        expect(normalizeSoundName('bling.wav', 'system')).toBe('bling.wav')
        expect(normalizeSoundName('system', 'system')).toBe('system')
        expect(normalizeSoundName('kiss-1.wav', 'system')).toBe('kiss-1.wav')
    })

    it('refuses path traversal and absolute paths', () => {
        expect(normalizeSoundName('../../etc/passwd', 'system')).toBe('system')
        expect(normalizeSoundName('/etc/shadow.wav', 'system')).toBe('system')
        expect(normalizeSoundName('..%2F..%2Fx.wav', 'system')).toBe('system')
        expect(normalizeSoundName('sub/dir/sound.wav', 'system')).toBe('system')
    })

    it('refuses non-wav files', () => {
        expect(normalizeSoundName('payload.sh', 'system')).toBe('system')
    })
})

describe('normalizeSchedule', () => {
    it('fills in every weekday', () => {
        const schedule = normalizeSchedule({ monday: { enabled: true, timeRanges: [{ start: '10:00', end: '11:00' }] } })
        expect(Object.keys(schedule).sort()).toEqual(['friday', 'monday', 'saturday', 'sunday', 'thursday', 'tuesday', 'wednesday'].sort())
    })

    it('drops malformed ranges', () => {
        const schedule = normalizeSchedule({
            monday: {
                enabled: true,
                timeRanges: [
                    { start: '10:00', end: '11:00' },
                    { start: 'x', end: 'y' },
                    { start: '12:00', end: '12:00' },
                ],
            },
        })
        expect(schedule.monday.timeRanges).toEqual([{ start: '10:00', end: '11:00' }])
    })

    it('gives an enabled day with no usable ranges a sane default', () => {
        const schedule = normalizeSchedule({ monday: { enabled: true, timeRanges: [] } })
        expect(schedule.monday.timeRanges.length).toBeGreaterThan(0)
    })

    it('clears ranges on a disabled day', () => {
        const schedule = normalizeSchedule({ tuesday: { enabled: false, timeRanges: [{ start: '09:00', end: '17:00' }] } })
        expect(schedule.tuesday.timeRanges).toEqual([])
    })

    it('preserves overnight ranges', () => {
        const schedule = normalizeSchedule({ friday: { enabled: true, timeRanges: [{ start: '22:00', end: '02:00' }] } })
        expect(schedule.friday.timeRanges).toEqual([{ start: '22:00', end: '02:00' }])
    })
})

describe('normalizeStats', () => {
    it('replaces negative and non-numeric values', () => {
        const stats = normalizeStats({ breakStreakCount: -3, highestStreakCount: 'lots' })
        expect(stats.breakStreakCount).toBe(0)
        expect(stats.highestStreakCount).toBe(0)
    })

    it('keeps valid values', () => {
        expect(normalizeStats({ breakStreakCount: 7 }).breakStreakCount).toBe(7)
    })
})

describe('settings limits', () => {
    it('are internally consistent', () => {
        for (const [name, limit] of Object.entries(SETTINGS_LIMITS)) {
            expect(limit.min, name).toBeLessThan(limit.max)
            expect(limit.min, name).toBeGreaterThan(0)
        }
    })

    it('accept the shipped defaults', () => {
        expect(normalizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
        expect(DEFAULT_SETTINGS.summaryDuration).toBe(5 * SECOND)
    })
})
