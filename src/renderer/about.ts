export {}

function setText(id: string, value: string): void {
    const element = document.getElementById(id)
    if (element) element.textContent = value
}

window.api
    .getAppInfo()
    .then((info) => {
        setText('version', info.version)
        setText('author', `BlinkBlink © ${new Date().getFullYear()}`)
        setText('description', info.description)
        setText('license', info.license)
        setText('build-info', `Electron ${info.electron} · ${info.platform}-${info.arch}`)

        const websiteLink = document.getElementById('website') as HTMLAnchorElement | null
        if (websiteLink) {
            websiteLink.href = info.website
            websiteLink.textContent = 'BlinkBlink Website'
        }

        const supportLink = document.getElementById('support') as HTMLAnchorElement | null
        if (supportLink) {
            supportLink.href = `mailto:${info.supportEmail}`
            supportLink.textContent = info.supportEmail
        }
    })
    .catch((error) => console.error('Failed to load app info:', error))

const updateButton = document.getElementById('update-button') as HTMLButtonElement | null

if (updateButton) {
    updateButton.textContent = 'Check for updates'
    updateButton.addEventListener('click', async () => {
        updateButton.disabled = true
        updateButton.textContent = 'Checking…'

        try {
            const result = await window.api.checkForUpdates()
            updateButton.textContent = result?.updateAvailable
                ? `Update available${result.version ? ` (${result.version})` : ''}`
                : 'Up to date ✔'
        } catch {
            updateButton.textContent = 'Check for updates'
        } finally {
            updateButton.disabled = false
        }
    })
}

/**
 * External links are routed through the main process, which vets the scheme.
 * Navigating this window itself would replace the About page with a web page
 * and leave no way back.
 */
document.addEventListener('click', (event) => {
    const anchor = (event.target as HTMLElement | null)?.closest('a')
    if (!anchor?.href) return
    event.preventDefault()
    void window.api.openExternal(anchor.href)
})
