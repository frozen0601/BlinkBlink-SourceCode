export {}

/**
 * Settings window.
 *
 * Moved out of an inline `<script>` so the page can run under a strict CSP in a
 * sandboxed renderer. Behaviour is unchanged apart from the additions noted
 * below: saves are debounced, and controls the current platform cannot honour
 * are disabled with an explanation rather than silently doing nothing.
 */

import type { BackdropPreference, DayKey, ReminderStyle, Settings, TimeRange } from '../core/types'

interface Capabilities {
    platform: string
    isMac: boolean
    isWindows: boolean
    isLinux: boolean
    backdropMode: string
    autostartSupported: boolean
    notificationActionsSupported: boolean
    autoUpdateManagedExternally: boolean
}

const DAYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Saves are coalesced so dragging a number spinner is one write, not thirty. */
const SAVE_DEBOUNCE_MS = 250

let ready = false
let saveTimer: number | undefined

// Helpers ---------------------------------------------------------------

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null

const input = (id: string) => byId<HTMLInputElement>(id)
const select = (id: string) => byId<HTMLSelectElement>(id)

function numberValue(id: string, fallback: number): number {
    const element = input(id)
    const parsed = element ? Number(element.value) : Number.NaN
    return Number.isFinite(parsed) ? parsed : fallback
}

function setDisabled(controlId: string, disabled: boolean, note?: string): void {
    const control = byId(controlId)
    const item = control?.closest('.setting-item')
    if (!control || !item) return

    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) control.disabled = disabled
    item.classList.toggle('disabled', disabled)

    const existing = item.querySelector('.platform-note')
    existing?.remove()

    if (disabled && note) {
        const hint = document.createElement('span')
        hint.className = 'platform-note'
        hint.textContent = note
        item.querySelector('.setting-item-text')?.appendChild(hint)
    }
}

// Schedule editor -------------------------------------------------------

function adjustedEndTime(startTime: string): string {
    const [hours, minutes] = startTime.split(':').map(Number)
    const end = (hours + 1) % 24
    return `${String(end).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function createTimeRangeElement(day: DayKey, range: TimeRange = { start: '09:00', end: '18:00' }): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'time-range'

    const startGroup = document.createElement('div')
    startGroup.className = 'time-input-group'
    const startInput = document.createElement('input')
    startInput.type = 'time'
    startInput.className = 'time-input start'
    startInput.value = range.start
    startGroup.appendChild(startInput)

    const separator = document.createElement('span')
    separator.className = 'time-range-separator'
    separator.textContent = 'to'

    const endGroup = document.createElement('div')
    endGroup.className = 'time-input-group'
    const endInput = document.createElement('input')
    endInput.type = 'time'
    endInput.className = 'time-input end'
    endInput.value = range.end
    endGroup.appendChild(endInput)

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'remove-range'
    remove.setAttribute('aria-label', `Remove hours for ${day}`)
    remove.textContent = '×'

    wrapper.append(startGroup, separator, endGroup, remove)

    // An end time equal to the start is meaningless; an *earlier* one is a
    // legitimate overnight shift, so only the equal case is corrected.
    const validate = () => {
        if (endInput.value === startInput.value) endInput.value = adjustedEndTime(startInput.value)
        scheduleSave()
    }

    startInput.addEventListener('change', validate)
    endInput.addEventListener('change', validate)
    remove.addEventListener('click', () => {
        wrapper.remove()
        scheduleSave()
    })

    return wrapper
}

function updateDayState(checkbox: HTMLInputElement): void {
    const dayElement = checkbox.closest('.schedule-day')
    const day = checkbox.dataset.day as DayKey | undefined
    if (!dayElement || !day) return

    const ranges = byId(`${day}-ranges`)
    if (!ranges) return

    dayElement.classList.toggle('disabled', !checkbox.checked)

    if (checkbox.checked && ranges.children.length === 0) ranges.appendChild(createTimeRangeElement(day))
    else if (!checkbox.checked) ranges.replaceChildren()
}

function buildScheduleEditor(): void {
    const container = document.querySelector('.schedule-days')
    if (!container) return

    container.replaceChildren()

    DAYS.forEach((day, index) => {
        const dayElement = document.createElement('div')
        dayElement.className = 'schedule-day'

        const header = document.createElement('div')
        header.className = 'day-header'

        const name = document.createElement('div')
        name.className = 'day-name'

        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.className = 'day-enabled'
        checkbox.dataset.day = day
        checkbox.id = `day-${day}`

        const label = document.createElement('label')
        label.htmlFor = checkbox.id
        label.textContent = DAY_LABELS[index]

        name.append(checkbox, label)

        const addButton = document.createElement('button')
        addButton.type = 'button'
        addButton.className = 'add-range'
        addButton.textContent = '+ Add Hours'

        header.append(name, addButton)

        const ranges = document.createElement('div')
        ranges.className = 'time-ranges'
        ranges.id = `${day}-ranges`

        dayElement.append(header, ranges)
        container.appendChild(dayElement)

        checkbox.addEventListener('change', () => {
            updateDayState(checkbox)
            scheduleSave()
        })

        addButton.addEventListener('click', () => {
            ranges.appendChild(createTimeRangeElement(day))
            scheduleSave()
        })

        header.addEventListener('click', (event) => {
            const target = event.target as HTMLElement
            if (target.closest('.add-range') || target.closest('input') || target.closest('label')) return
            checkbox.checked = !checkbox.checked
            checkbox.dispatchEvent(new Event('change'))
        })
    })
}

function readSchedule(): Settings['schedule'] {
    const schedule = {} as Settings['schedule']

    for (const day of DAYS) {
        const enabled = document.querySelector<HTMLInputElement>(`input[data-day="${day}"]`)?.checked ?? false
        const ranges = Array.from(document.querySelectorAll<HTMLElement>(`#${day}-ranges .time-range`)).map((element) => ({
            start: element.querySelector<HTMLInputElement>('.start')?.value ?? '09:00',
            end: element.querySelector<HTMLInputElement>('.end')?.value ?? '18:00',
        }))

        schedule[day] = { enabled, timeRanges: enabled ? ranges : [] }
    }

    return schedule
}

// Save ------------------------------------------------------------------

function collectSettings(): Partial<Settings> {
    return {
        workDuration: numberValue('workDuration', 20) * 60 * 1000,
        breakDuration: numberValue('breakDuration', 20) * 1000,
        enableAutoDismiss: input('enableAutoDismiss')?.checked ?? true,
        summaryDuration: numberValue('summaryDuration', 5) * 1000,
        enableBreakNotification: input('enableBreakNotification')?.checked ?? true,
        reminderStyle: (select('reminderStyle')?.value as ReminderStyle) ?? 'system',
        breakPreNotificationOffset: numberValue('breakPreNotificationOffset', 30) * 1000,
        skipBreakWhenIdle: input('skipBreakWhenIdle')?.checked ?? true,
        idleThreshold: numberValue('idleThreshold', 5) * 60 * 1000,
        enableSoundNotification: input('enableSoundNotification')?.checked ?? true,
        notificationSound: select('notificationSound')?.value ?? 'system',
        scheduleEnabled: input('scheduleEnabled')?.checked ?? false,
        schedule: readSchedule(),
        startOnBoot: input('startOnBoot')?.checked ?? false,
        autoUpdate: input('autoUpdate')?.checked ?? false,
        overlayBackdrop: (select('overlayBackdrop')?.value as BackdropPreference) ?? 'auto',
        language: select('languageSelect')?.value ?? 'en',
        // Defaults to on, matching DEFAULT_SETTINGS: a missing checkbox must
        // not read as an opt-out the user never made.
        enableAnalytics: input('enableAnalytics')?.checked ?? true,
    }
}

function scheduleSave(): void {
    if (!ready) return
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
        void window.api
            .saveSettings(collectSettings())
            // The main process clamps values; reflect anything it corrected so
            // the form never shows a number that was not actually saved.
            .then(applyClampedValues)
            .catch((error) => console.error('Failed to save settings:', error))
    }, SAVE_DEBOUNCE_MS)
}

function applyClampedValues(saved: Settings): void {
    const assign = (id: string, value: number) => {
        const element = input(id)
        if (element && document.activeElement !== element) element.value = String(value)
    }

    assign('workDuration', saved.workDuration / 60_000)
    assign('breakDuration', saved.breakDuration / 1000)
    assign('summaryDuration', saved.summaryDuration / 1000)
    assign('breakPreNotificationOffset', saved.breakPreNotificationOffset / 1000)
    assign('idleThreshold', saved.idleThreshold / 60_000)
}

// Dependent-control state ----------------------------------------------

function refreshDependentStates(): void {
    const autoDismiss = input('enableAutoDismiss')?.checked ?? false
    const reminders = input('enableBreakNotification')?.checked ?? false
    const sound = input('enableSoundNotification')?.checked ?? false

    setDisabled('idleThreshold', !(input('skipBreakWhenIdle')?.checked ?? false))
    setDisabled('summaryDuration', !autoDismiss)
    setDisabled('breakPreNotificationOffset', !reminders)
    setDisabled('reminderStyle', !reminders)
    setDisabled('notificationSound', !sound)

    const scheduleSettings = byId('scheduleSettings')
    if (scheduleSettings) scheduleSettings.style.display = input('scheduleEnabled')?.checked ? 'block' : 'none'
}

// Bootstrap -------------------------------------------------------------

async function initialise(): Promise<void> {
    const [settings, capabilities, sounds] = await Promise.all([
        window.api.getSettings(),
        window.api.getCapabilities(),
        window.api.getAvailableSounds(),
    ])

    // Sounds first, so setting the stored value below actually matches an option.
    const soundSelect = select('notificationSound')
    if (soundSelect) {
        soundSelect.replaceChildren()
        const defaultOption = document.createElement('option')
        defaultOption.value = 'system'
        defaultOption.textContent = 'Default'
        soundSelect.appendChild(defaultOption)

        for (const sound of sounds) {
            const option = document.createElement('option')
            option.value = sound.filename
            option.textContent = sound.name
            soundSelect.appendChild(option)
        }
    }

    buildScheduleEditor()

    const setChecked = (id: string, value: boolean) => {
        const element = input(id)
        if (element) element.checked = value
    }
    const setValue = (id: string, value: string) => {
        const element = input(id) ?? select(id)
        if (element) element.value = value
    }

    setChecked('startOnBoot', settings.startOnBoot)
    setChecked('enableAutoDismiss', settings.enableAutoDismiss)
    setChecked('enableBreakNotification', settings.enableBreakNotification)
    setChecked('scheduleEnabled', settings.scheduleEnabled)
    setChecked('autoUpdate', settings.autoUpdate)
    setChecked('enableSoundNotification', settings.enableSoundNotification)
    setChecked('skipBreakWhenIdle', settings.skipBreakWhenIdle)
    setChecked('enableAnalytics', settings.enableAnalytics)

    setValue('summaryDuration', String(settings.summaryDuration / 1000))
    setValue('breakPreNotificationOffset', String(settings.breakPreNotificationOffset / 1000))
    setValue('workDuration', String(settings.workDuration / 60_000))
    setValue('idleThreshold', String(settings.idleThreshold / 60_000))
    setValue('breakDuration', String(settings.breakDuration / 1000))
    setValue('languageSelect', settings.language)
    setValue('notificationSound', settings.notificationSound)
    setValue('reminderStyle', settings.reminderStyle)
    setValue('overlayBackdrop', settings.overlayBackdrop)

    for (const day of DAYS) {
        const checkbox = document.querySelector<HTMLInputElement>(`input[data-day="${day}"]`)
        const ranges = byId(`${day}-ranges`)
        if (!checkbox || !ranges) continue

        const config = settings.schedule[day]
        checkbox.checked = config.enabled
        ranges.replaceChildren()
        for (const range of config.timeRanges) ranges.appendChild(createTimeRangeElement(day, range))
        updateDayState(checkbox)
    }

    applyCapabilities(capabilities)
    refreshDependentStates()

    ready = true
}

/** Reflects what this platform can actually do, rather than offering dead controls. */
function applyCapabilities(capabilities: Capabilities): void {
    if (!capabilities.autostartSupported) {
        setDisabled('startOnBoot', true, 'Managed by your package manager on this system.')
    }

    if (capabilities.autoUpdateManagedExternally) {
        setDisabled('autoUpdate', true, 'Updates are delivered by your package manager or the Snap Store.')
    }

    const backdropNote = byId('backdrop-note')
    if (backdropNote) {
        const explanation: Record<string, string> = {
            vibrancy: 'Using the macOS blur effect.',
            acrylic: 'Using the Windows 11 acrylic effect.',
            translucent: 'This system cannot blur behind windows, so a dimmed overlay is used instead.',
            solid: 'Using a solid background.',
        }
        backdropNote.textContent = explanation[capabilities.backdropMode] ?? ''
    }

    const reminderNote = byId('reminder-note')
    if (reminderNote && capabilities.isMac && !capabilities.notificationActionsSupported) {
        reminderNote.textContent = 'System notifications on macOS cannot show a Skip button unless the app is code signed.'
    }
}

// Tabs ------------------------------------------------------------------

function bindTabs(): void {
    document.querySelectorAll<HTMLButtonElement>('.tab-button').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach((other) => other.classList.remove('active'))
            button.classList.add('active')

            const tabName = button.dataset.tab
            document.querySelectorAll<HTMLElement>('.tab-content').forEach((content) => {
                content.classList.toggle('active', content.dataset.tab === tabName)
            })
        })
    })
}

function bindInputs(): void {
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((element) => {
        element.addEventListener('change', () => {
            refreshDependentStates()
            scheduleSave()
        })
    })

    // Clicking anywhere on a row toggles its checkbox.
    document.querySelectorAll<HTMLElement>('.setting-item').forEach((item) => {
        const checkbox = item.querySelector<HTMLInputElement>('input[type="checkbox"]')
        if (!checkbox) return

        item.addEventListener('click', (event) => {
            const target = event.target as HTMLElement
            if (target.closest('input') || target.closest('select') || target.closest('button')) return
            if (checkbox.disabled) return
            checkbox.checked = !checkbox.checked
            checkbox.dispatchEvent(new Event('change'))
        })
    })

    // Preview the chosen sound.
    select('notificationSound')?.addEventListener('change', async (event) => {
        if (!input('enableSoundNotification')?.checked) return
        const value = (event.target as HTMLSelectElement).value
        try {
            const soundPath = await window.api.getSoundPath(value)
            if (soundPath) await new Audio(`file://${soundPath}`).play()
        } catch (error) {
            console.error('Failed to preview the sound:', error)
        }
    })
}

bindTabs()
bindInputs()
void initialise().catch((error) => console.error('Failed to load settings:', error))
