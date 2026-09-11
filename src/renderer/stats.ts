export {}

import { formatDuration } from '../core/format'
import {
    BreakHistory,
    HourRow,
    formatHour,
    hourBreakdown,
    summarySentence,
    totalBreaks,
    weekSummary,
    weeklyTrend,
    worstHour,
} from '../core/breakHistory'

const SVG = 'http://www.w3.org/2000/svg'

function byId<T extends HTMLElement | SVGElement>(id: string): T | null {
    return document.getElementById(id) as T | null
}

function setText(id: string, value: string): void {
    const element = byId(id)
    if (element) element.textContent = value
}

/**
 * Closes the eye by the share of breaks that went by.
 *
 * The lid is drawn from the top of the socket down, so 100% is a wide open eye
 * and 0% is a shut one, with the lash line riding its edge.
 */
function drawEye(rate: number): void {
    const socketTop = 12
    const socketHeight = 176
    const closed = Math.max(0, Math.min(1, 1 - rate)) * socketHeight

    const lid = byId<SVGRectElement>('lid')
    const lash = byId<SVGRectElement>('lash')
    lid?.setAttribute('height', String(socketTop + closed))
    lash?.setAttribute('y', String(socketTop + closed - 2))
    lash?.setAttribute('opacity', closed > 3 ? '1' : '0')
}

/** The eight-week line, or nothing when there is not enough history to draw one. */
function drawTrend(rates: (number | null)[]): void {
    const svg = byId<SVGSVGElement>('trend')
    if (!svg) return
    svg.replaceChildren()

    const width = 560
    const height = 88
    const top = height - 6 - (height - 16)

    const points = rates
        .map((rate, index) =>
            rate === null ? null : ([(index / (rates.length - 1)) * (width - 14) + 7, height - 6 - rate * (height - 16)] as const)
        )
        .filter((point): point is readonly [number, number] => point !== null)

    const guide = document.createElementNS(SVG, 'line')
    guide.setAttribute('class', 'guide')
    guide.setAttribute('x1', '7')
    guide.setAttribute('x2', String(width - 7))
    guide.setAttribute('y1', String(top))
    guide.setAttribute('y2', String(top))
    svg.appendChild(guide)

    if (points.length < 2) return

    const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
    const area = document.createElementNS(SVG, 'path')
    area.setAttribute('class', 'area')
    area.setAttribute('d', `${line}L${points[points.length - 1][0].toFixed(1)} ${height}L${points[0][0].toFixed(1)} ${height}Z`)
    svg.appendChild(area)

    const stroke = document.createElementNS(SVG, 'path')
    stroke.setAttribute('class', 'line')
    stroke.setAttribute('d', line)
    svg.appendChild(stroke)

    const [lastX, lastY] = points[points.length - 1]
    const head = document.createElementNS(SVG, 'circle')
    head.setAttribute('class', 'head')
    head.setAttribute('cx', lastX.toFixed(1))
    head.setAttribute('cy', lastY.toFixed(1))
    head.setAttribute('r', '4')
    svg.appendChild(head)
}

function drawHours(hours: HourRow[]): void {
    const container = byId('hours')
    if (!container) return
    container.replaceChildren()

    const worst = worstHour(hours)

    for (const row of hours) {
        const total = row.taken + row.skipped
        const line = document.createElement('div')
        line.className = row.hour === worst ? 'hour worst' : 'hour'

        const label = document.createElement('span')
        label.textContent = formatHour(row.hour)

        const track = document.createElement('span')
        track.className = 'track'
        const took = document.createElement('span')
        took.className = 'took'
        took.style.display = 'block'
        took.style.width = `${Math.round((row.taken / total) * 100)}%`
        track.appendChild(took)

        const figure = document.createElement('span')
        figure.className = 'figure'
        figure.textContent = row.skipped === 0 ? 'none skipped' : `${row.skipped} skipped`

        line.append(label, track, figure)
        container.appendChild(line)
    }
}

async function render(): Promise<void> {
    const [history, stats] = await Promise.all([window.api.getBreakHistory() as Promise<BreakHistory>, window.api.getStats()])
    const now = new Date()

    const summary = weekSummary(history, now)
    const hours = hourBreakdown(history, now)

    setText('taken', String(summary.taken))
    setText('offered', String(summary.offered))
    setText('summary', summarySentence(summary, hours))
    drawEye(summary.offered === 0 ? 1 : summary.taken / summary.offered)

    // Nothing recorded yet: the eye and the sentence say so on their own, and
    // an empty chart with an axis under it would just look broken.
    const total = totalBreaks(history)
    if (total === 0) {
        document.body.classList.add('empty')
    } else {
        drawTrend(weeklyTrend(history, now))
        drawHours(hours)
    }

    const streak = stats.breakStreakCount ?? 0
    setText('streak-count', `${streak} ${streak === 1 ? 'break' : 'breaks'}`)
    setText(
        'streak-best',
        stats.highestStreakCount > 0 ? `· best ${stats.highestStreakCount}, over ${formatDuration(stats.highestStreakDuration)}` : ''
    )
    setText('since', total > 0 ? `${total.toLocaleString()} breaks taken since you installed BlinkBlink.` : '')
}

render().catch((error) => console.error('Failed to load stats:', error))
