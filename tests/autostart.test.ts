import { describe, expect, it } from 'vitest'
import { autostartEntryIsStale, readExecLine } from '../src/core/autostart'

const entry = (exec: string) => ['[Desktop Entry]', 'Type=Application', 'Name=BlinkBlink', `Exec=${exec}`, 'Terminal=false', ''].join('\n')

describe('readExecLine', () => {
    it('reads the command back out of a desktop entry', () => {
        expect(readExecLine(entry('"/opt/BlinkBlink" --hidden'))).toBe('"/opt/BlinkBlink" --hidden')
    })

    it('is null when there is no Exec line at all', () => {
        expect(readExecLine('[Desktop Entry]\nType=Application\n')).toBeNull()
    })
})

describe('autostartEntryIsStale', () => {
    it('is false when the entry already runs this install', () => {
        const command = '"/home/u/Apps/BlinkBlink-0.2.4-x86_64.AppImage" --hidden'
        expect(autostartEntryIsStale(entry(command), command)).toBe(false)
    })

    it('is true after an AppImage update renames the file', () => {
        // The updater writes the new version under its own name and deletes the
        // old one, so the entry is left pointing at a path that is gone.
        const before = entry('"/home/u/Apps/BlinkBlink-0.2.3-x86_64.AppImage" --hidden')
        expect(autostartEntryIsStale(before, '"/home/u/Apps/BlinkBlink-0.2.4-x86_64.AppImage" --hidden')).toBe(true)
    })

    it('is true for an entry with no Exec line, which cannot start anything', () => {
        expect(autostartEntryIsStale('[Desktop Entry]\n', '"/opt/BlinkBlink" --hidden')).toBe(true)
    })

    it('says nothing about a missing entry — that is the enabled/disabled question', () => {
        expect(autostartEntryIsStale(null, '"/opt/BlinkBlink" --hidden')).toBe(false)
    })
})
