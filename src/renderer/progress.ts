export {}

const bar = document.getElementById('progress')
const label = document.getElementById('progress-text')

const megabytes = (bytes: number) => (bytes / 1_048_576).toFixed(1)

window.api.onDownloadProgress((progress) => {
    const percent = Math.round((progress.percent ?? 0) * 100)
    if (bar) bar.style.width = `${percent}%`
    if (label) {
        label.textContent = progress.totalBytes
            ? `${percent}% · ${megabytes(progress.transferredBytes)} MB of ${megabytes(progress.totalBytes)} MB`
            : `${percent}%`
    }
})
