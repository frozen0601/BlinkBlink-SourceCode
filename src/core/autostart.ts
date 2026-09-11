/**
 * Decisions about the freedesktop autostart entry, kept out of `main/` so they
 * can be tested without a desktop.
 */

/** Reads the `Exec=` line out of a desktop entry, or null if it has none. */
export function readExecLine(entry: string): string | null {
    for (const line of entry.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('Exec=')) return trimmed.slice('Exec='.length).trim()
    }
    return null
}

/**
 * Whether an existing autostart entry still points at this install.
 *
 * It stops pointing at it more often than it looks. An AppImage updates by
 * replacing its own file, and because the filename carries a version the
 * replacement can land under a different name — leaving an entry that runs a
 * file that no longer exists, silently, until someone reboots and notices
 * BlinkBlink did not come back.
 */
export function autostartEntryIsStale(existing: string | null, desiredCommand: string): boolean {
    if (existing === null) return false
    return readExecLine(existing) !== desiredCommand
}
