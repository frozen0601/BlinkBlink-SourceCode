export {}

// Types
interface Stats {
    breakStreakCount: number
    breakStreakDuration: number
}

enum View {
    Break = 'break',
    Summary = 'summary',
}

interface IElectronAPI {
    onShowView: (callback: (view: View) => void) => void
    onStartCountdown: (callback: (duration: number) => void) => void
    onCountdownUpdate: (callback: (countdown: number) => void) => void
    dismissSummary: () => void
    skipBreak: () => void
    getStats: () => Promise<Stats>
    getSettings: () => Promise<any>
    getSoundPath: (filename: string) => Promise<string>
}

declare global {
    interface Window {
        api: IElectronAPI
    }
}

class UnifiedUI {
    private skipConfirmed = false
    private summaryDuration: number = 0
    private currentView: View = View.Break
    private elements: {
        progressBar: HTMLElement
        progressTracker: HTMLElement
        centralCircle: HTMLElement
        skipButton: HTMLElement
        dismissButton: HTMLElement
        warningText: HTMLElement
    }

    constructor() {
        this.elements = this.getDOMElements()
        this.initializeEventListeners()
    }

    private getDOMElements() {
        const getElement = (id: string): HTMLElement => {
            const element = document.getElementById(id)
            if (!element) throw new Error(`Element ${id} not found`)
            return element
        }

        return {
            progressBar: getElement('progress-bar'),
            progressTracker: getElement('progress-tracker'),
            centralCircle: getElement('central-circle'),
            skipButton: getElement('skip-button'),
            dismissButton: getElement('dismiss-button'),
            warningText: getElement('warning-text'),
        }
    }

    private initializeEventListeners() {
        this.initializeViewSwitching()
        this.initializeButtonHandlers()
        this.initializeIpcEvents()
        this.initializeWindowLoad()
    }

    private initializeViewSwitching() {
        window.api.onShowView((view: View) => {
            this.currentView = view // Update the current view
            document.body.className = `ready show-${view}`

            if (view === View.Summary) {
                this.initializeSummary()
            } else {
                this.initializeBreak()
            }
        })
    }

    private initializeButtonHandlers() {
        this.elements.skipButton?.addEventListener('click', () => this.handleSkipClick())
        this.elements.dismissButton?.addEventListener('click', () => {
            window.api.dismissSummary()
            window.close()
        })
    }

    private initializeIpcEvents() {
        window.api.onStartCountdown((duration: number) => this.startProgress(duration))
        window.api.onCountdownUpdate((countdown: number) => {
            if (countdown <= 0) {
                // Only dismiss if currently in Summary View
                if (this.currentView === View.Summary) {
                    window.api.dismissSummary()
                    window.close()
                } // Otherwise, let the main process handle the transition (Break -> Summary)
            }
        })
    }

    private initializeWindowLoad() {
        window.addEventListener('load', () => {
            document.body.classList.add('ready')
        })
    }

    private startProgress(duration: number) {
        const { progressBar } = this.elements
        progressBar.style.transition = `transform ${duration / 1000}s linear`
        progressBar.style.display = 'block'
        requestAnimationFrame(() => (progressBar.style.transform = 'scaleX(1)'))
    }

    private async handleSkipClick() {
        if (!this.skipConfirmed) {
            const stats = await window.api.getStats()
            this.elements.warningText.textContent = `You're on a streak of ${stats.breakStreakCount} breaks. Skipping will reset it. Continue?`
            this.elements.warningText.style.display = 'block'
            this.elements.skipButton.textContent = 'Confirm'
            this.skipConfirmed = true
        } else {
            window.api.skipBreak()
            window.close()
        }
    }

    private initializeBreak() {
        this.elements.warningText.style.display = 'none'
        this.elements.skipButton.textContent = 'Skip'
        this.skipConfirmed = false
    }

    private async initializeSummary() {
        try {
            const stats = await window.api.getStats()
            this.updateProgressTracker(stats.breakStreakCount)
            this.elements.progressBar.style.transform = 'scaleX(0)'

            // Get settings first to check if auto-dismiss is enabled
            const settings = await window.api.getSettings()

            // Play notification sound if enabled
            if (settings?.enableSoundNotification) {
                try {
                    const soundPath = await window.api.getSoundPath(settings.notificationSound)
                    const audio = new Audio(`file://${soundPath}`)
                    await audio.play()
                } catch (error) {
                    console.error('Failed to play notification sound:', error)
                }
            }

            if (!settings?.enableAutoDismiss) return

            // Only initialize progress bar if auto-dismiss is enabled
            const progressBar = this.elements.dismissButton.querySelector('.progress-bar')
            if (progressBar) {
                const progressFill = progressBar.querySelector('.progress-fill') || progressBar
                if (progressFill instanceof HTMLElement) {
                    progressFill.style.transition = 'none'
                    progressFill.style.transform = 'scaleX(0)'
                    progressFill.offsetHeight // Force a reflow
                    progressFill.style.transition = `transform ${settings.summaryDuration}ms linear`
                    progressFill.style.transform = 'scaleX(1)'
                }
            }
        } catch (error) {
            console.error('Failed to initialize summary:', error)
        }
    }

    private updateMilestoneMarkers(count: number, milestones: number[]): void {
        const container = this.elements.progressTracker
        const hitMilestone = milestones.some((m) => m === count)
        const nextMilestone = !hitMilestone ? milestones.find((m) => m > count) : null

        // Find current segment
        let currentSegmentStart = milestones[0]
        let currentSegmentEnd = milestones[1]

        for (let i = 0; i < milestones.length - 1; i++) {
            if (count >= milestones[i] && count <= milestones[i + 1]) {
                currentSegmentStart = milestones[i]
                currentSegmentEnd = milestones[i + 1]
                break
            }
        }

        // Calculate segment-based progress
        const segmentProgress = (count - currentSegmentStart) / (currentSegmentEnd - currentSegmentStart)
        const segmentWidth = 100 / (milestones.length - 1)
        const completedSegments = milestones.findIndex((m) => m === currentSegmentStart)
        const totalProgress = completedSegments * segmentWidth + segmentWidth * segmentProgress

        container.innerHTML = `
            <div class="milestone-markers">
                ${milestones
                    .map((milestone, index) => {
                        const isHit = count === milestone
                        const isNext = milestone === nextMilestone
                        // Position based on index instead of value
                        const positionPercent = (index / (milestones.length - 1)) * 100

                        return `
                            <div class="milestone-marker
                                ${count >= milestone ? 'reached' : ''}
                                ${isHit ? 'milestone-hit' : ''}
                                ${isNext ? 'next-milestone' : ''}"
                                style="left: ${positionPercent}%; transform: translateX(-50%);">
                                ${milestone}
                            </div>
                        `
                    })
                    .join('')}
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${Math.min(totalProgress, 100)}%;"></div>
            </div>
        `

        const progressFill = container.querySelector('.progress-fill') as HTMLElement
        if (progressFill) {
            progressFill.style.width = `${Math.min(totalProgress, 100)}%`
        }
    }

    private updateCentralCircle(count: number, prevMilestone: number, nextMilestone: number): void {
        const numberElement = this.elements.centralCircle.querySelector('.number')
        if (numberElement) numberElement.textContent = count.toString()
    }

    private calculateMilestones(currentStreak: number): number[] {
        if (currentStreak <= 50) {
            return [0, 3, 10, 20, 50]
        }

        const setNumber = Math.floor((currentStreak - 51) / 100)
        const baseNumber = 50 + setNumber * 100
        return [baseNumber, baseNumber + 25, baseNumber + 50, baseNumber + 75, baseNumber + 100]
    }

    private updateProgressTracker(count: number) {
        const milestones = this.calculateMilestones(count)
        const nextMilestone = milestones.find((m) => m > count) || milestones[milestones.length - 1]
        const prevMilestone = milestones.filter((m) => m <= count).pop() || 0

        this.updateMilestoneMarkers(count, milestones)
        this.updateCentralCircle(count, prevMilestone, nextMilestone)
    }
}

// Initialize the unified UI
new UnifiedUI()
