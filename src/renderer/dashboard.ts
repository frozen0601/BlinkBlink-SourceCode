import { ipcRenderer } from 'electron'

// Types
interface Stats {
    breakStreakCount: number
    breakStreakDuration: number
}

interface DashboardElements {
    progressTracker: HTMLElement
    centralCircle: HTMLElement
    dismissButton: HTMLElement
    progressBar: HTMLElement
}

// Constants
const MILESTONE_TIERS = {
    BASE: [3, 10, 20, 50],
    MEDIUM: [75, 100, 125, 150],
    HIGH: [100, 150, 200, 250],
}

// UI Management
class DashboardUI {
    private elements: DashboardElements

    constructor() {
        this.elements = this.getDOMElements()
        this.initializeEventListeners()
    }

    private getDOMElements(): DashboardElements {
        const getElement = (id: string): HTMLElement => {
            const element = document.getElementById(id)
            if (!element) throw new Error(`Element ${id} not found`)
            return element
        }

        return {
            progressTracker: getElement('progress-tracker'),
            centralCircle: getElement('central-circle'),
            dismissButton: getElement('dismiss-button'),
            progressBar: getElement('dismiss-button').querySelector('.progress') as HTMLElement,
        }
    }

    private initializeEventListeners(): void {
        this.elements.dismissButton.addEventListener('click', () => {
            ipcRenderer.send('dashboard-dismissed')
        })

        ipcRenderer.on('close-dashboard', () => {
            window.close()
        })

        document.addEventListener('DOMContentLoaded', () => {
            this.initializeProgressBar()
        })

        window.addEventListener('load', () => {
            document.body.classList.add('ready')
        })
    }

    private initializeProgressBar(): void {
        ipcRenderer.on('start-countdown', (_, duration: number) => {
            const { progressBar } = this.elements
            progressBar.style.transition = `transform ${duration / 1000}s linear`
            progressBar.style.display = 'block'
            requestAnimationFrame(() => (progressBar.style.transform = 'scaleX(1)'))
        })
    }

    public updateProgressTracker(count: number): void {
        const milestones = this.calculateMilestones(count)
        const nextMilestone = milestones.find((m) => m > count) || milestones[milestones.length - 1]
        const prevMilestone = milestones.filter((m) => m <= count).pop() || 0

        this.updateMilestoneMarkers(count, milestones)
        this.updateCentralCircle(count, prevMilestone, nextMilestone)
    }

    private updateMilestoneMarkers(count: number, milestones: number[]): void {
        const container = this.elements.progressTracker
        const fullMilestones = [0, ...milestones]

        container.innerHTML = `
            <div class="milestone-markers">
                ${fullMilestones
                    .map(
                        (milestone) => `
                    <div class="milestone-marker ${count >= milestone ? 'reached' : ''} ${
                            count < milestone && count >= (fullMilestones[fullMilestones.indexOf(milestone) - 1] || 0) ? 'current' : ''
                        } ${milestone === Math.max(...fullMilestones) && count >= milestone ? 'reached' : ''}">
                        ${milestone}
                    </div>
                `
                    )
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

        if (count === nextMilestone) {
            this.elements.centralCircle.classList.add('milestone-reached')
            setTimeout(() => {
                this.elements.centralCircle.classList.remove('milestone-reached')
            }, 1000)
        }
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
}

// Application initialization
async function initializeDashboard() {
    try {
        const dashboard = new DashboardUI()
        const stats = (await ipcRenderer.invoke('get-stats')) as Stats
        dashboard.updateProgressTracker(stats.breakStreakCount)

        ipcRenderer.on('countdown-update', (_, countdown: number) => {
            if (countdown <= 0) {
                ipcRenderer.send('dashboard-dismissed')
                window.close()
            }
        })
    } catch (error) {
        console.error('Failed to initialize dashboard:', error)
    }
}

initializeDashboard()
