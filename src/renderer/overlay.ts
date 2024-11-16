import { ipcRenderer } from 'electron'

const MILESTONE_TIERS = {
    BASE: [3, 10, 20, 50],
    MEDIUM: [75, 100, 125, 150],
    HIGH: [100, 150, 200, 250],
}

// Types
interface Stats {
    breakStreakCount: number
    breakStreakDuration: number
}

// 1. Define View Enum
enum View {
    Break = 'break',
    Summary = 'summary',
}

// 2. Inject ipcRenderer via constructor for better testability
class UnifiedUI {
    private skipConfirmed = false
    private summaryDuration: number = 0
    private elements: {
        progressBar: HTMLElement
        progressTracker: HTMLElement
        centralCircle: HTMLElement
        skipButton: HTMLElement
        dismissButton: HTMLElement
        warningText: HTMLElement
    }

    constructor(private ipc: typeof ipcRenderer = ipcRenderer) {
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

    // 3. Refactor initializeEventListeners into separate methods
    private initializeEventListeners() {
        this.initializeViewSwitching()
        this.initializeButtonHandlers()
        this.initializeIpcEvents()
        this.initializeWindowLoad()
    }

    private initializeViewSwitching() {
        this.ipc.on('show-view', (_, view: View) => {
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
            this.ipc.send('summary-dismissed')
            window.close()
        })
    }

    private initializeIpcEvents() {
        this.ipc.on('start-countdown', (_, duration: number) => this.startProgress(duration))
        this.ipc.on('countdown-update', (_, countdown: number) => {
            if (countdown <= 0) {
                this.ipc.send('summary-dismissed')
                window.close()
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
            const stats = (await this.ipc.invoke('get-stats')) as Stats
            this.elements.warningText.textContent = `You're on a streak of ${stats.breakStreakCount} breaks. Skipping will reset it. Continue?`
            this.elements.warningText.style.display = 'block'
            this.elements.skipButton.textContent = 'Confirm'
            this.skipConfirmed = true
        } else {
            this.ipc.send('break-skip')
            window.close()
        }
    }

    private initializeBreak() {
        this.elements.warningText.style.display = 'none'
        this.elements.skipButton.textContent = 'Skip'
        this.skipConfirmed = false
    }

    // 4. Enhance error handling in initializeSummary
    private async initializeSummary() {
        try {
            const stats = (await this.ipc.invoke('get-stats')) as Stats
            this.updateProgressTracker(stats.breakStreakCount)
            this.elements.progressBar.style.transform = 'scaleX(0)'

            // Get settings first to check if auto-dismiss is enabled
            const settings = await this.ipc.invoke('get-settings')
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
        const fullMilestones = [0, ...milestones]
        const hitMilestone = milestones.some((m) => m === count)
        const nextMilestone = !hitMilestone ? milestones.find((m) => m > count) : null

        container.innerHTML = `
            <div class="milestone-markers">
                ${fullMilestones
                    .map((milestone) => {
                        const isHit = count === milestone
                        const isNext = milestone === nextMilestone
                        return `
                            <div class="milestone-marker
                                ${count >= milestone ? 'reached' : ''}
                                ${isHit ? 'milestone-hit' : ''}
                                ${isNext ? 'next-milestone' : ''}">
                                ${milestone}
                            </div>
                        `
                    })
                    .join('')}
            </div>
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
        `

        // Find current segment
        let currentSegmentStart = 0
        let currentSegmentEnd = fullMilestones[1]

        for (let i = 0; i < fullMilestones.length - 1; i++) {
            if (count >= fullMilestones[i] && count <= fullMilestones[i + 1]) {
                currentSegmentStart = fullMilestones[i]
                currentSegmentEnd = fullMilestones[i + 1]
                break
            }
        }

        // Calculate segment-based progress
        const segmentProgress = (count - currentSegmentStart) / (currentSegmentEnd - currentSegmentStart)
        const segmentWidth = 100 / (fullMilestones.length - 1) // Width of each segment
        const completedSegments = fullMilestones.findIndex((m) => m === currentSegmentStart)
        const totalProgress = completedSegments * segmentWidth + segmentWidth * segmentProgress

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
            return MILESTONE_TIERS.BASE
        }
        if (currentStreak <= 150) {
            return [...MILESTONE_TIERS.BASE, ...MILESTONE_TIERS.MEDIUM]
        }

        const baseNumber = Math.floor(currentStreak / 100) * 100
        return [...MILESTONE_TIERS.BASE, ...MILESTONE_TIERS.MEDIUM, ...MILESTONE_TIERS.HIGH.map((offset) => baseNumber + offset)]
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
