export {}

const dismiss = document.getElementById('dismiss')

window.api
    .getWhatsNew()
    .then(({ version, lines }) => {
        const versionElement = document.getElementById('version')
        if (versionElement) versionElement.textContent = version

        const list = document.getElementById('lines')
        if (!list) return
        for (const line of lines) {
            const item = document.createElement('li')
            item.textContent = line
            list.appendChild(item)
        }
    })
    .catch((error) => console.error('Failed to load the release note:', error))

dismiss?.addEventListener('click', () => window.api.dismissWhatsNew())

// The window is frameless and carries one action, so Escape should do it too.
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') window.api.dismissWhatsNew()
})
