import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

function getSoundsPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'assets/sounds')
    }
    return path.join(__dirname, '../assets/sounds')
}

export function getSoundPath(soundValue: string): string {
    const filename = soundValue === 'system' ? 'bling.wav' : soundValue
    return path.join(getSoundsPath(), filename)
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
