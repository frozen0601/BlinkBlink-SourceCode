const pages = ['welcome', 'rule', 'usage', 'settings']
let currentPageIndex = 0

const prevBtn = document.getElementById('prevBtn')
const nextBtn = document.getElementById('nextBtn')
const finishBtn = document.getElementById('finishBtn')

function updateButtons() {
    prevBtn.style.display = currentPageIndex > 0 ? 'inline' : 'none'
    nextBtn.style.display = currentPageIndex < pages.length - 1 ? 'inline' : 'none'
    finishBtn.style.display = currentPageIndex === pages.length - 1 ? 'inline' : 'none'
}

function showPage(index) {
    // Remove active class from all pages
    document.querySelectorAll('.page').forEach((page) => {
        page.classList.remove('active')
    })

    // Add active class to current page and scroll to it
    const nextPage = document.getElementById(pages[index])
    nextPage.classList.add('active')
    nextPage.scrollIntoView({ behavior: 'smooth' })

    currentPageIndex = index
    updateButtons()
}

// Add settings management
const { ipcRenderer } = require('electron')

async function updateTrayImage() {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isMac = process.platform === 'darwin'

    const trayImage = document.querySelector('.tray-screenshot')
    if (trayImage) {
        const imageName = `tray_${isDark ? 'dark' : 'light'}_${isMac ? 'mac' : 'windows'}.png`
        trayImage.src = imageName
    }
}

// Reusable function to add scale effect on click
function addClickScaleEffect(elements, scaleAmount = 0.95, duration = 150) {
    elements.forEach((element) => {
        element.addEventListener('click', () => {
            element.style.transform = `scale(${scaleAmount})`
            setTimeout(() => {
                element.style.transform = ''
            }, duration)
        })
    })
}

// Reusable function for ripple effect
function createRipple(e) {
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const ripple = document.createElement('div')
    ripple.className = 'ripple'
    ripple.style.left = `${x}px`
    ripple.style.top = `${y}px`

    btn.appendChild(ripple)

    ripple.addEventListener('animationend', () => {
        ripple.remove()
    })
}

async function saveQuickSettings(setting, value) {
    const settings = await ipcRenderer.invoke('get-settings')
    const updatedSettings = {
        ...settings,
        [setting]: value,
    }
    ipcRenderer.send('save-settings', updatedSettings)
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize the tutorial
    showPage(currentPageIndex)
    await updateTrayImage()

    // Update tray image when system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTrayImage)

    // Load and apply settings
    const settings = await ipcRenderer.invoke('get-settings')

    // Update setting cards state
    document.querySelectorAll('.setting-card').forEach((card) => {
        const setting = card.dataset.setting
        if (settings[setting]) {
            card.classList.add('active')
        }

        // Make the entire card clickable
        card.addEventListener('click', async (e) => {
            const newState = !card.classList.contains('active')
            card.classList.toggle('active', newState)
            await saveQuickSettings(setting, newState)
        })
    })

    // Simplify interactive features
    addClickScaleEffect(document.querySelectorAll('.rule-item'))

    // Remove previous feature card hover effect
    // Add smooth cursor interaction to elements with class 'hover-move'
    document.querySelectorAll('.hover-move').forEach((element) => {
        element.addEventListener('mousemove', (e) => {
            const bounds = element.getBoundingClientRect()
            const mouseX = e.clientX - bounds.left
            const xCenter = mouseX / bounds.width
            element.style.transform = `translateX(${xCenter * 8}px)`
        })

        element.addEventListener('mouseleave', () => {
            element.style.transform = ''
        })
    })

    // Enhance button feedback with ripple effect
    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.addEventListener('click', createRipple)
    })

    // Add click scale effect to customize option cards
    addClickScaleEffect(document.querySelectorAll('.option-card'))

    // Add click scale effect to feature items
    addClickScaleEffect(document.querySelectorAll('.feature-item'))
})

prevBtn.addEventListener('click', () => {
    if (currentPageIndex > 0) {
        showPage(currentPageIndex - 1)
    }
})

nextBtn.addEventListener('click', () => {
    if (currentPageIndex < pages.length - 1) {
        showPage(currentPageIndex + 1)
    }
})

finishBtn.addEventListener('click', () => {
    window.close()
})
