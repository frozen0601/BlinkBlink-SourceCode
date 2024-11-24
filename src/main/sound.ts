import { shell, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import sound from 'sound-play' // for Windows and macOS
const audioPlayer = require('play-sound')({}) // for Linux

function getSoundsPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'assets/sounds')
    }
    return path.join(__dirname, '../assets/sounds')
}

function playLinuxSound(soundPath: string) {
    return new Promise<void>((resolve, reject) => {
        audioPlayer.play(soundPath, (err: Error | null) => {
            if (err) reject(err)
            else resolve()
        })
    })
}

export async function playNotificationSound(soundValue: string) {
    // Handle system sound
    if (soundValue === 'system') {
        if (process.platform === 'linux') {
            const defaultSound = path.join(getSoundsPath(), 'bling.wav')
            if (!fs.existsSync(defaultSound)) {
                shell.beep()
                return
            }
            try {
                await playLinuxSound(defaultSound)
            } catch {
                shell.beep()
            }
            return
        }
        shell.beep()
        return
    }

    // Handle custom sounds
    try {
        const soundPath = path.join(getSoundsPath(), soundValue)
        const playSound = process.platform === 'linux' ? playLinuxSound : sound.play
        await playSound(soundPath)
    } catch (error) {
        console.error('Failed to play sound:', error)
        shell.beep()
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
