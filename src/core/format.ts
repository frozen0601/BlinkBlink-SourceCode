/** Presentation helpers shared by the tray, the overlay and the stats window. */

/** "45m", "1h", "2h 15m" — the tray title, which has very little room. */
export function formatRemainingTime(minutes: number): string {
    const safe = Math.max(0, Math.round(minutes))
    if (safe < 60) return `${safe}m`

    const hours = Math.floor(safe / 60)
    const mins = safe % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

/** "3 days 4 hours", "12 minutes", "0 seconds" — the stats window. */
export function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return '0 seconds'

    const seconds = Math.floor((ms / 1000) % 60)
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24)
    const days = Math.floor(ms / (1000 * 60 * 60 * 24))

    const plural = (value: number, unit: string) => `${value} ${value === 1 ? unit : `${unit}s`}`
    const parts: string[] = []

    if (days) parts.push(plural(days, 'day'))
    if (hours) parts.push(plural(hours, 'hour'))
    if (minutes) parts.push(plural(minutes, 'minute'))
    if (parts.length === 0) parts.push(plural(seconds, 'second'))

    return parts.join(' ')
}

/**
 * The five markers shown on the streak progress bar.
 *
 * Up to 50 breaks the milestones are hand-picked and close together so early
 * progress feels quick; past that they step in even hundreds.
 */
export function calculateMilestones(streak: number): number[] {
    if (streak <= 50) return [0, 3, 10, 20, 50]

    const setNumber = Math.floor((streak - 51) / 100)
    const base = 50 + setNumber * 100
    return [base, base + 25, base + 50, base + 75, base + 100]
}

/** Fraction (0..1) of the way through the current milestone band. */
export function milestoneProgress(streak: number, milestones: number[]): number {
    if (milestones.length < 2) return 0

    const first = milestones[0]
    const last = milestones[milestones.length - 1]
    if (streak <= first) return 0
    if (streak >= last) return 1

    let index = 0
    for (let i = 0; i < milestones.length - 1; i++) {
        if (streak >= milestones[i] && streak < milestones[i + 1]) {
            index = i
            break
        }
    }

    const segmentStart = milestones[index]
    const segmentEnd = milestones[index + 1]
    const segmentWidth = 1 / (milestones.length - 1)
    const withinSegment = (streak - segmentStart) / (segmentEnd - segmentStart)

    return index * segmentWidth + withinSegment * segmentWidth
}
