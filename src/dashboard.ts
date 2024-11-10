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
    BASE: [5, 10, 20, 50],
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
        const nextMilestone = milestones.find((m) => m > count) || null

        this.elements.progressTracker.innerHTML = this.createMilestonesHTML(count, milestones, nextMilestone)
        this.updateCentralCircle(count)
    }

    private calculateMilestones(currentStreak: number): number[] {
        if (currentStreak <= 50) return MILESTONE_TIERS.BASE
        if (currentStreak <= 150) return MILESTONE_TIERS.MEDIUM

        const baseNumber = Math.floor(currentStreak / 100) * 100
        return MILESTONE_TIERS.HIGH.map((offset) => baseNumber + offset)
    }

    private createMilestonesHTML(count: number, milestones: number[], nextMilestone: number | null): string {
        return milestones
            .map((threshold) => {
                const className = this.getMilestoneClassName(count, threshold, nextMilestone)
                return `<div class="${className}" data-threshold="${threshold}">${threshold}</div>`
            })
            .join('')
    }

    private getMilestoneClassName(count: number, threshold: number, nextMilestone: number | null): string {
        if (count === threshold) return 'circle milestone-hit'
        if (count > threshold) return 'circle filled'
        if (threshold === nextMilestone) return 'circle next-milestone'
        return 'circle'
    }

    private updateCentralCircle(count: number): void {
        const numberElement = this.elements.centralCircle.querySelector('.number')
        if (numberElement) numberElement.textContent = count.toString()
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
