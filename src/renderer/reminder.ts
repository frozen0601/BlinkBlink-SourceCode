export {}

/**
 * Pre-break reminder toast.
 *
 * Everything it needs arrives as query parameters so the first paint is already
 * correct — there is no round trip to the main process before the toast is
 * visible.
 */

const params = new URLSearchParams(window.location.search)
const breakAt = Number(params.get('breakAt'))
const shape = params.get('shape') === 'square' ? 'square' : 'rounded'

document.documentElement.dataset.shape = shape

const countdownEl = document.getElementById('countdown') as HTMLElement | null
const progressEl = document.getElementById('progress') as HTMLElement | null
const skipButton = document.getElementById('skip') as HTMLButtonElement | null
const startNowButton = document.getElementById('start-now') as HTMLButtonElement | null

const shownAt = Date.now()
const totalMs = Number.isFinite(breakAt) && breakAt > shownAt ? breakAt - shownAt : 0

function describeRemaining(ms: number): string {
    const seconds = Math.max(0, Math.ceil(ms / 1000))
    if (seconds >= 120) return `Starting in ${Math.round(seconds / 60)} minutes`
    if (seconds >= 60) {
        const mins = Math.floor(seconds / 60)
        const rest = seconds % 60
        return rest ? `Starting in ${mins}m ${rest}s` : `Starting in ${mins}m`
    }
    if (seconds <= 1) return 'Starting now'
    return `Starting in ${seconds} seconds`
}

function tick(): void {
    if (!totalMs) return
    const remaining = breakAt - Date.now()
    if (countdownEl) countdownEl.textContent = describeRemaining(remaining)
    if (progressEl) progressEl.style.transform = `scaleX(${Math.max(0, Math.min(1, remaining / totalMs))})`
    if (remaining <= 0) window.clearInterval(timer)
}

const timer = window.setInterval(tick, 200)
tick()

/** Plays the leave animation before letting the main process close the window. */
function dismissWith(action: () => void): void {
    document.body.classList.add('leaving')
    window.setTimeout(action, 140)
}

skipButton?.addEventListener('click', () => dismissWith(() => window.api.reminderSkip()))
startNowButton?.addEventListener('click', () => dismissWith(() => window.api.reminderStartNow()))

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dismissWith(() => window.api.reminderDismiss())
})

requestAnimationFrame(() => document.body.classList.add('ready'))
