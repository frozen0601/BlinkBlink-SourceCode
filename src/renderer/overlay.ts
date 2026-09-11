export {}

/**
 * The full-screen break / summary overlay.
 *
 * The backdrop mode chosen by the main process arrives as a query parameter and
 * is stamped onto `<html>` before anything paints, so the stylesheet can pick
 * the right treatment without a flash of the wrong one.
 */

const View = { Break: 'break', Summary: 'summary' } as const
type ViewName = (typeof View)[keyof typeof View]

const MILESTONE_LADDER_SIZE = 5

function calculateMilestones(streak: number): number[] {
    if (streak <= 50) return [0, 3, 10, 20, 50]
    const setNumber = Math.floor((streak - 51) / 100)
    const base = 50 + setNumber * 100
    return [base, base + 25, base + 50, base + 75, base + 100]
}

function milestoneProgress(streak: number, milestones: number[]): number {
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

    const segmentWidth = 1 / (milestones.length - 1)
    const within = (streak - milestones[index]) / (milestones[index + 1] - milestones[index])
    return index * segmentWidth + within * segmentWidth
}

class OverlayUI {
    #skipArmed = false
    #currentView: ViewName = View.Break

    readonly #progressBar = document.getElementById('progress-bar')
    readonly #progressTracker = document.getElementById('progress-tracker')
    readonly #centralCircle = document.getElementById('central-circle')
    readonly #skipButton = document.getElementById('skip-button')
    readonly #dismissButton = document.getElementById('dismiss-button')
    readonly #warningText = document.getElementById('warning-text')

    constructor() {
        this.#applyBackdrop()
        this.#bindButtons()
        this.#bindMainProcessEvents()

        const initialView = new URLSearchParams(window.location.search).get('view')
        this.#setView(initialView === View.Summary ? View.Summary : View.Break)

        window.addEventListener('load', () => document.body.classList.add('ready'))
    }

    /** Stamps the backdrop mode so the stylesheet can select its treatment. */
    #applyBackdrop(): void {
        const backdrop = new URLSearchParams(window.location.search).get('backdrop') ?? 'solid'
        const known = ['vibrancy', 'acrylic', 'translucent', 'solid']
        document.documentElement.dataset.backdrop = known.includes(backdrop) ? backdrop : 'solid'
    }

    #bindButtons(): void {
        this.#skipButton?.addEventListener('click', () => void this.#handleSkipClick())
        this.#dismissButton?.addEventListener('click', () => this.#dismiss())
    }

    #bindMainProcessEvents(): void {
        window.api.onShowView((view) => this.#setView(view === View.Summary ? View.Summary : View.Break))
        // `countdown-update` is deliberately not subscribed to. The break used
        // to show the remaining seconds as a large number, which reads as a
        // stopwatch to watch rather than a cue to look away. The bar along the
        // bottom edge carries the same information without asking for
        // attention. The main process still runs the per-second interval; it is
        // what ends the break.
        window.api.onStartCountdown((duration) => this.#startProgress(duration))
    }

    #setView(view: ViewName): void {
        this.#currentView = view
        document.body.className = `ready show-${view}`

        if (view === View.Summary) void this.#initializeSummary()
        else this.#initializeBreak()
    }

    #dismiss(): void {
        window.api.dismissSummary()
    }

    #startProgress(duration: number): void {
        if (!this.#progressBar) return
        this.#progressBar.style.transition = 'none'
        this.#progressBar.style.transform = 'scaleX(0)'
        this.#progressBar.style.display = 'block'
        void this.#progressBar.offsetHeight // Force a reflow so the reset applies.
        this.#progressBar.style.transition = `transform ${duration}ms linear`
        requestAnimationFrame(() => {
            if (this.#progressBar) this.#progressBar.style.transform = 'scaleX(1)'
        })
    }

    async #handleSkipClick(): Promise<void> {
        if (this.#currentView !== View.Break) return

        if (!this.#skipArmed) {
            const stats = await window.api.getStats().catch(() => ({ breakStreakCount: 0, breakStreakDuration: 0 }))
            if (this.#warningText) {
                this.#warningText.textContent =
                    stats.breakStreakCount > 0
                        ? `You're on a streak of ${stats.breakStreakCount} breaks. Skipping will reset it. Continue?`
                        : 'Skip this break?'
                this.#warningText.style.display = 'block'
            }
            if (this.#skipButton) this.#skipButton.textContent = 'Confirm skip'
            this.#skipArmed = true
            return
        }

        window.api.skipBreak()
    }

    #initializeBreak(): void {
        if (this.#warningText) this.#warningText.style.display = 'none'
        if (this.#skipButton) this.#skipButton.textContent = 'Skip'
        this.#skipArmed = false
    }

    async #initializeSummary(): Promise<void> {
        try {
            const [stats, settings] = await Promise.all([window.api.getStats(), window.api.getSettings()])

            this.#renderProgressTracker(stats.breakStreakCount)
            if (this.#progressBar) this.#progressBar.style.transform = 'scaleX(0)'

            if (settings?.enableSoundNotification) await this.#playSound(settings.notificationSound)
            if (settings?.enableAutoDismiss) this.#animateDismissButton(settings.summaryDuration)
        } catch (error) {
            console.error('Failed to initialise the summary view:', error)
        }
    }

    async #playSound(name: string): Promise<void> {
        try {
            const soundPath = await window.api.getSoundPath(name)
            if (!soundPath) return
            const audio = new Audio(`file://${soundPath}`)
            await audio.play()
        } catch (error) {
            // Autoplay policy or a missing codec; never worth blocking the view.
            console.error('Failed to play the notification sound:', error)
        }
    }

    #animateDismissButton(durationMs: number): void {
        const progressBar = this.#dismissButton?.querySelector('.progress-bar')
        const fill = progressBar?.querySelector('.progress-fill') ?? progressBar
        if (!(fill instanceof HTMLElement)) return

        fill.style.transition = 'none'
        fill.style.transform = 'scaleX(0)'
        void fill.offsetHeight
        fill.style.transition = `transform ${durationMs}ms linear`
        fill.style.transform = 'scaleX(1)'
    }

    /**
     * Renders the milestone ladder.
     *
     * Built from DOM nodes rather than an HTML string so the streak value never
     * reaches an `innerHTML` parse, and so the CSP does not need loosening.
     */
    #renderProgressTracker(streak: number): void {
        if (!this.#progressTracker) return

        const milestones = calculateMilestones(streak)
        const nextMilestone = milestones.find((value) => value > streak) ?? null

        this.#progressTracker.replaceChildren()

        const markers = document.createElement('div')
        markers.className = 'milestone-markers'

        milestones.forEach((milestone, index) => {
            const marker = document.createElement('div')
            marker.className = 'milestone-marker'
            marker.classList.toggle('reached', streak >= milestone)
            marker.classList.toggle('milestone-hit', streak === milestone)
            marker.classList.toggle('next-milestone', milestone === nextMilestone)
            marker.style.left = `${(index / (MILESTONE_LADDER_SIZE - 1)) * 100}%`
            marker.textContent = String(milestone)
            markers.appendChild(marker)
        })

        const bar = document.createElement('div')
        bar.className = 'progress-bar'
        const fill = document.createElement('div')
        fill.className = 'progress-fill'
        fill.style.width = `${Math.min(100, milestoneProgress(streak, milestones) * 100)}%`
        bar.appendChild(fill)

        this.#progressTracker.append(markers, bar)

        const number = this.#centralCircle?.querySelector('.number')
        if (number) number.textContent = String(streak)
    }
}

new OverlayUI()
