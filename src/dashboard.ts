import { ipcRenderer } from 'electron'
import { DURATIONS } from './constants'

function calculateMilestones(currentStreak: number): number[] {
    const baseMilestones = [5, 10, 20, 50]

    if (currentStreak <= 50) {
        return baseMilestones
    }

    if (currentStreak <= 150) {
        return [75, 100, 125, 150]
    }

    const baseNumber = Math.floor(currentStreak / 100) * 100
    return [100, 150, 200, 250].map((offset) => baseNumber + offset)
}

function updateProgressTracker(count: number) {
    const progressTracker = document.getElementById('progress-tracker')
    if (!progressTracker) {
        console.error('Progress tracker element not found')
        return
    }
    const milestones = calculateMilestones(count)

    // Find next milestone
    const nextMilestone = milestones.find((m) => m > count) || null

    progressTracker.innerHTML = ''
    milestones.forEach((threshold) => {
        const circle = document.createElement('div')
        let className = 'circle'

        if (count === threshold) {
            // Exact milestone hit
            className += ' milestone-hit'
        } else if (count > threshold) {
            // Past milestone
            className += ' filled'
        } else if (threshold === nextMilestone) {
            // Next milestone to achieve
            className += ' next-milestone'
        }

        circle.className = className
        circle.setAttribute('data-threshold', threshold.toString()) // Convert number to string
        circle.textContent = threshold.toString()
        progressTracker.appendChild(circle)
    })

    const centralCircleNumber = document.getElementById('central-circle')?.querySelector('.number')
    if (centralCircleNumber) {
        centralCircleNumber.textContent = count.toString()
    } else {
        console.error('Central circle number element not found')
    }
}

// Event listeners and initialization
ipcRenderer.invoke('get-stats').then((stats) => {
    updateProgressTracker(stats.breakStreakCount)
})

ipcRenderer.on('countdown-update', (event, countdown) => {
    if (countdown <= 0) {
        ipcRenderer.send('dashboard-dismissed')
        window.close()
    }
})

ipcRenderer.invoke('get-stats').then((stats) => {
    const breakStreakCountElement = document.getElementById('break-streak-count')
    if (breakStreakCountElement) {
        breakStreakCountElement.textContent = stats.breakStreakCount.toString()
    } else {
        console.error('Break streak count element not found')
    }
})

const dismissButton = document.getElementById('dismiss-button')
if (dismissButton) {
    dismissButton.addEventListener('click', () => {
        ipcRenderer.send('dashboard-dismissed')
        window.close()
    })
} else {
    console.error('Dismiss button element not found')
}

// Add this after other event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize progress bar
    const progressBar = document.querySelector<HTMLElement>('#dismiss-button .progress')
    if (progressBar) {
        // console.log('Progress bar element found')
        progressBar.style.transition = `transform ${DURATIONS.DASHBOARD_DURATION / 1000}s linear` // Use DASHBOARD_DURATION
    } else {
        console.error('Progress bar element not found')
    }

    // Wait for all resources to load
    window.addEventListener('load', () => {
        // Show content only when everything is ready
        document.body.classList.add('ready')
        // Start progress bar animation
        const progressBarElement = document.querySelector<HTMLElement>('#dismiss-button .progress')
        if (progressBarElement) {
            setTimeout(() => {
                progressBarElement!.style.transform = 'scaleX(1)' // Non-null assertion
            }, 100)
        } else {
            console.error('Progress bar element not found for animation')
        }
    })
})
