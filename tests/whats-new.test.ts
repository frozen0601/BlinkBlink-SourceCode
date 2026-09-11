import { describe, expect, it } from 'vitest'
import { noteToShow, RELEASE_NOTES } from '../src/core/whatsNew'

const VERSION = Object.keys(RELEASE_NOTES)[0]

const input = (overrides: Partial<Parameters<typeof noteToShow>[0]> = {}) => ({
    version: VERSION,
    lastSeenVersion: '0.2.3',
    firstRun: false,
    ...overrides,
})

describe('noteToShow', () => {
    it('shows the note once after an update', () => {
        expect(noteToShow(input())).toEqual(RELEASE_NOTES[VERSION])
    })

    it('does not show it again on the next launch', () => {
        expect(noteToShow(input({ lastSeenVersion: VERSION }))).toBeNull()
    })

    it('stays out of a first run, which has the walkthrough instead', () => {
        expect(noteToShow(input({ firstRun: true, lastSeenVersion: '' }))).toBeNull()
    })

    it('shows it to someone upgrading from a build that never recorded a version', () => {
        // Everyone on 0.2.3 and earlier. They are the audience for the note
        // that introduces it, so an empty marker cannot mean "skip".
        expect(noteToShow(input({ lastSeenVersion: '' }))).toEqual(RELEASE_NOTES[VERSION])
    })

    it('shows nothing for a version with no note written for it', () => {
        expect(noteToShow(input({ version: '9.9.9' }))).toBeNull()
    })

    it('keeps every note short enough to read', () => {
        for (const [version, lines] of Object.entries(RELEASE_NOTES)) {
            expect(lines.length, `${version} has too many lines`).toBeLessThanOrEqual(3)
            for (const line of lines) {
                expect(line.length, `${version}: "${line}" is too long`).toBeLessThanOrEqual(90)
            }
        }
    })
})
