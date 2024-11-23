import { shell, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getSettings } from './store'
import sound from 'sound-play'

function getSoundsPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'assets/sounds')
    }
    return path.join(__dirname, '../assets/sounds')
}

export function playNotificationSound(soundValue: string) {
    if (soundValue === 'system') {
        shell.beep()
    } else {
        try {
            const soundPath = path.join(getSoundsPath(), soundValue)
            sound.play(soundPath).catch((error: Error) => {
                console.error('Failed to play sound:', error)
                shell.beep()
            })
        } catch (error) {
            console.error('Failed to play sound:', error)
            shell.beep()
        }
    }
}

export function getAvailableSounds() {
    const soundsPath = getSoundsPath()
    return fs
        .readdirSync(soundsPath)
        .filter((file) => file.endsWith('.wav'))
        .map((file) => ({
            filename: file,
            name: file
                .replace('.wav', '')
                .replace(/-/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase()),
        }))
}
