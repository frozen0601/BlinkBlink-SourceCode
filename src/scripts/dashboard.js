const { ipcRenderer } = require('electron')
const { formatDuration, intervalToDuration } = require('date-fns')
// const { DURATIONS } = require('../constants') // Import DURATIONS
// import { DURATIONS } from '../constants'

// import { TEST_CONSTANT } from '../test'
// console.log(TEST_CONSTANT) // Should log 'Test worked!'

function calculateMilestones(currentStreak) {
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

function updateProgressTracker(count) {
    const progressTracker = document.getElementById('progress-tracker')
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
        circle.setAttribute('data-threshold', threshold)
        circle.textContent = threshold
        progressTracker.appendChild(circle)
    })

    document.getElementById('central-circle').querySelector('.number').textContent = count
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
    document.getElementById('break-streak-count').textContent = stats.breakStreakCount
})

document.getElementById('dismiss-button').addEventListener('click', () => {
    ipcRenderer.send('dashboard-dismissed')
    window.close()
})

// Add this after other event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize progress bar
    const progressBar = document.querySelector('#dismiss-button .progress')
    progressBar.style.transition = 'transform 1s linear'
    // progressBar.style.transition = `transform ${DURATIONS.DASHBOARD_DURATION / 1000}s linear` // Use DASHBOARD_DURATION

    // Wait for all resources to load
    window.addEventListener('load', () => {
        // Show content only when everything is ready
        document.body.classList.add('ready')
        // Start progress bar animation
        setTimeout(() => {
            progressBar.style.transform = 'scaleX(1)'
        }, 100)
    })
})
