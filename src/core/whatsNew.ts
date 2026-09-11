/**
 * The short "what changed" note shown once after an update.
 *
 * Hand-written per release rather than generated from commit messages: the
 * point is to tell someone what is different for *them*, in three lines they
 * will actually read. A release with nothing worth saying gets no entry, and
 * then nothing is shown — silence is a valid answer.
 */

/** Lines to show for a version. Keep to three, and write them for a user. */
export const RELEASE_NOTES: Record<string, string[]> = {
    '0.2.4': [
        'Intel Macs have a build of their own again.',
        'AppImage installs update themselves now, the way the Windows build does.',
        'A lighter download: the app is about a fifth smaller.',
    ],
}

export interface WhatsNewInput {
    /** `app.getVersion()`. */
    version: string
    /** The version this install last showed a note for; empty if it never has. */
    lastSeenVersion: string
    /** True when this launch is the first the store has seen. */
    firstRun: boolean
}

/**
 * The note to show now, or null to show nothing.
 *
 * An install that has never recorded a version but is not a first run is
 * someone who just upgraded from a build that predates this feature — exactly
 * the audience for the note, so they get it rather than being skipped.
 */
export function noteToShow(input: WhatsNewInput): string[] | null {
    const { version, lastSeenVersion, firstRun } = input

    // A fresh install gets the walkthrough; it does not need to be told what
    // changed in a version it has never run.
    if (firstRun) return null
    if (lastSeenVersion === version) return null

    const lines = RELEASE_NOTES[version]
    return lines && lines.length > 0 ? lines : null
}
