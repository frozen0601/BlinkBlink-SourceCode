/*
 * Regenerates the mascot silhouette used by the pre-break toast.
 *
 * The toast shows the app's mascot as a single-colour glyph so it can take the
 * accent colour and follow the light/dark theme. The path it draws is derived
 * from `assets/icon.png` by this script rather than drawn by hand, so if the
 * icon is ever redrawn the glyph can be brought back into line instead of
 * slowly diverging from it.
 *
 * Not part of any build. It needs `sharp`, which is not a dependency of the
 * app, so install it for the run and throw it away again:
 *
 *     npm install --no-save sharp
 *     node tools/derive-toast-mascot.mjs > /tmp/mascot.svg
 *
 * Then paste the `d` attribute into `src/renderer/reminder.html`.
 *
 * How it works: the outer shape is the icon's alpha channel — a smooth blob
 * that already carries the horns — and the features are punched out of it.
 * Taking the outline stroke as the perimeter instead looks obvious but fails:
 * that stroke lightens in places, and the fill leaks through the gaps as a
 * fringe of spikes. Marching squares traces the result and Douglas-Peucker
 * simplifies it down to something small enough to inline.
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'
const sharp = createRequire(import.meta.url)('sharp')

/** Working resolution. The icon is 512², so this resamples nothing. */
const SIZE = 512
/** Luminance below this is ink: the outlines, the pupil, the open mouth. */
const INK = 60
/** Regions smaller than this are anti-aliasing debris, not features. */
const MIN_AREA = 60
/** Douglas-Peucker tolerance, in source pixels. Higher is smaller and blunter. */
const EPS = 1.2

const { data } = await sharp(join(import.meta.dirname, '../assets/icon.png'))
    .resize(SIZE, SIZE)
    .raw()
    .toBuffer({ resolveWithObject: true })

// --- 1. Separate the blob from the ink inside it ---------------------------

const blob = new Uint8Array(SIZE * SIZE)
const ink = new Uint8Array(SIZE * SIZE)
for (let p = 0; p < SIZE * SIZE; p++) {
    const i = p * 4
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    blob[p] = data[i + 3] >= 128 ? 1 : 0
    ink[p] = blob[p] && lum < INK ? 1 : 0
}

const at = (m, x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 0 : m[y * SIZE + x])

/** Majority filter: keeps a pixel only if most of its neighbourhood agrees. */
function smooth(src) {
    const out = new Uint8Array(src.length)
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let n = 0
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) n += at(src, x + dx, y + dy)
            }
            out[y * SIZE + x] = n >= 5 ? 1 : 0
        }
    }
    return out
}

/** Four-connected components of one phase, as arrays of pixel indices. */
function components(m, phase) {
    const seen = new Uint8Array(m.length)
    const found = []
    for (let start = 0; start < m.length; start++) {
        if (seen[start] || m[start] !== phase) continue
        const stack = [start]
        const cells = []
        seen[start] = 1
        while (stack.length) {
            const p = stack.pop()
            cells.push(p)
            const x = p % SIZE
            const y = (p / SIZE) | 0
            for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ]) {
                const nx = x + dx
                const ny = y + dy
                if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue
                const q = ny * SIZE + nx
                if (seen[q] || m[q] !== phase) continue
                seen[q] = 1
                stack.push(q)
            }
        }
        found.push(cells)
    }
    return found
}

const mask = smooth(smooth(blob))
const inkClean = smooth(smooth(ink))

const touchesRim = (p) => {
    const x = p % SIZE
    const y = (p / SIZE) | 0
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (!at(blob, x + dx, y + dy)) return true
    }
    return false
}

for (const cells of components(inkClean, 1)) {
    // The body outline is the blob's own rim: punching it out would just shrink
    // the silhouette. Only ink that lies fully inside the blob is a feature.
    if (cells.length < MIN_AREA || cells.some(touchesRim)) continue
    for (const p of cells) mask[p] = 0
}

for (const cells of components(mask, 0)) {
    // Anything touching the border is the background, not a pinhole.
    if (cells.some((p) => p % SIZE === 0 || ((p / SIZE) | 0) === 0)) continue
    if (cells.length < MIN_AREA) for (const p of cells) mask[p] = 1
}

// --- 2. Trace the boundaries ----------------------------------------------

// Marching squares over a grid offset by half a pixel, so each cell reads four
// neighbouring mask values as a 4-bit case and contributes the edges between
// them. Edges are oriented consistently, which is what lets them be chained.
const edges = new Map()
const addEdge = (a, b) => {
    const k = a.join(',')
    if (!edges.has(k)) edges.set(k, [])
    edges.get(k).push(b)
}

for (let y = -1; y < SIZE; y++) {
    for (let x = -1; x < SIZE; x++) {
        const c = (at(mask, x, y) << 3) | (at(mask, x + 1, y) << 2) | (at(mask, x + 1, y + 1) << 1) | at(mask, x, y + 1)
        const N = [x + 0.5, y]
        const E = [x + 1, y + 0.5]
        const S = [x + 0.5, y + 1]
        const W = [x, y + 0.5]
        switch (c) {
            case 1:
                addEdge(S, W)
                break
            case 2:
                addEdge(E, S)
                break
            case 3:
                addEdge(E, W)
                break
            case 4:
                addEdge(N, E)
                break
            case 5:
                addEdge(N, W)
                addEdge(S, E)
                break
            case 6:
                addEdge(N, S)
                break
            case 7:
                addEdge(N, W)
                break
            case 8:
                addEdge(W, N)
                break
            case 9:
                addEdge(S, N)
                break
            case 10:
                addEdge(W, S)
                addEdge(E, N)
                break
            case 11:
                addEdge(E, N)
                break
            case 12:
                addEdge(W, E)
                break
            case 13:
                addEdge(S, E)
                break
            case 14:
                addEdge(W, S)
                break
        }
    }
}

const loops = []
while (edges.size) {
    const [first] = edges.keys()
    let key = first
    const points = []
    for (;;) {
        const next = edges.get(key)
        if (!next || !next.length) break
        const to = next.pop()
        if (!next.length) edges.delete(key)
        points.push(key.split(',').map(Number))
        key = to.join(',')
        if (key === first) break
    }
    if (points.length > 8) loops.push(points)
}

// --- 3. Simplify -----------------------------------------------------------

function rdp(points, eps) {
    if (points.length < 3) return points
    const [ax, ay] = points[0]
    const [bx, by] = points[points.length - 1]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    let far = 0
    let worst = 0
    for (let i = 1; i < points.length - 1; i++) {
        const d = Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len
        if (d > worst) {
            worst = d
            far = i
        }
    }
    if (worst <= eps) return [points[0], points[points.length - 1]]
    return [...rdp(points.slice(0, far + 1), eps).slice(0, -1), ...rdp(points.slice(far), eps)]
}

/**
 * Douglas-Peucker on a closed loop.
 *
 * Run straight at a ring, every point measures zero against the degenerate
 * start-equals-end chord and the whole loop collapses to two points. Cutting it
 * at the point furthest from the start gives two open curves to simplify.
 */
function rdpClosed(loop, eps) {
    let far = 0
    let worst = -1
    for (let i = 1; i < loop.length; i++) {
        const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1])
        if (d > worst) {
            worst = d
            far = i
        }
    }
    return [...rdp(loop.slice(0, far + 1), eps).slice(0, -1), ...rdp([...loop.slice(far), loop[0]], eps)]
}

const simplified = loops.map((loop) => rdpClosed(loop, EPS)).filter((loop) => loop.length > 3)

// --- 4. Emit ---------------------------------------------------------------

// Trimmed to its bounding box and scaled into a square 100-unit viewBox, so the
// glyph fills whatever box the CSS gives it and carries none of the icon's
// padding.
let minX = Infinity
let minY = Infinity
let maxX = -Infinity
let maxY = -Infinity
for (const loop of simplified) {
    for (const [x, y] of loop) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
    }
}
const span = Math.max(maxX - minX, maxY - minY)
const offsetX = minX - (span - (maxX - minX)) / 2
const offsetY = minY - (span - (maxY - minY)) / 2
const scale = (v, offset) => Math.round((v - offset) * (100 / span) * 10) / 10

const d = simplified.map((loop) => 'M' + loop.map(([x, y]) => `${scale(x, offsetX)} ${scale(y, offsetY)}`).join('L') + 'Z').join('')

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="${d}"/></svg>\n`)
process.stderr.write(`${simplified.length} contours, ${d.length} bytes of path data\n`)
