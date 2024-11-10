const { ipcRenderer } = require('electron')
const { formatDuration, intervalToDuration } = require('date-fns')

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

function formatTime(ms) {
    if (!ms) return '0 second'
    const duration = intervalToDuration({ start: 0, end: ms })
    if (duration.days > 0) {
        return `${duration.days} ${duration.days === 1 ? 'day' : 'days'}${
            duration.hours ? ` ${duration.hours} ${duration.hours === 1 ? 'hour' : 'hours'}` : ''
        }`
    }

    if (duration.hours > 0) {
        return `${duration.hours} ${duration.hours === 1 ? 'hour' : 'hours'}${
            duration.minutes ? ` ${duration.minutes} ${duration.minutes === 1 ? 'minute' : 'minutes'}` : ''
        }`
    }

    if (duration.minutes > 0) {
        return `${duration.minutes} ${duration.minutes === 1 ? 'minute' : 'minutes'}`
    }

    return `${duration.seconds} ${duration.seconds === 1 ? 'second' : 'seconds'}`
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
    document.getElementById('break-streak-duration').textContent = formatTime(stats.breakStreakDuration)
})

document.getElementById('dismiss-button').addEventListener('click', () => {
    ipcRenderer.send('dashboard-dismissed')
    window.close()
})

// Add this after other event listeners
document.addEventListener('DOMContentLoaded', () => {
    const progressBar = document.querySelector('#dismiss-button .progress');
    progressBar.style.transition = 'transform 5s linear';
    // Small delay to ensure transition is applied
    setTimeout(() => {
        progressBar.style.transform = 'scaleX(1)';
    }, 100);
})