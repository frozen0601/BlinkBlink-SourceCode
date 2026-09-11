/**
 * The renderer-facing API surface.
 *
 * Deliberately narrow: every entry is an explicit, named operation rather than
 * a passthrough. Nothing here touches Node or Electron modules beyond
 * `contextBridge`/`ipcRenderer`, which is what lets every window run with
 * `sandbox: true`.
 *
 * `openExternal` in particular is an IPC call rather than a direct `shell`
 * invocation, so the main process gets to vet the URL scheme before anything is
 * handed to the operating system.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { Settings, Stats } from '../core/types'

type Unsubscribe = () => void

function subscribe<T>(channel: string, callback: (value: T) => void): Unsubscribe {
    const listener = (_event: IpcRendererEvent, value: T) => callback(value)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.off(channel, listener)
}

const api = {
    platform: process.platform,

    // Reads
    getSettings: (): Promise<Settings> => ipcRenderer.invoke('get-settings'),
    getStats: (): Promise<Stats> => ipcRenderer.invoke('get-stats'),
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),
    getAvailableSounds: () => ipcRenderer.invoke('get-available-sounds'),
    getSoundPath: (filename: string): Promise<string | null> => ipcRenderer.invoke('get-sound-path', filename),
    getCapabilities: () => ipcRenderer.invoke('get-capabilities'),
    getWhatsNew: (): Promise<{ version: string; lines: string[] }> => ipcRenderer.invoke('get-whats-new'),
    getBreakHistory: () => ipcRenderer.invoke('get-break-history'),

    // Writes
    saveSettings: (settings: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('save-settings', settings),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('open-external', url),

    // Overlay actions
    dismissSummary: () => ipcRenderer.send('summary-dismissed'),
    dismissWhatsNew: () => ipcRenderer.send('whats-new-dismissed'),
    skipBreak: () => ipcRenderer.send('break-skip'),

    // Reminder toast actions
    reminderSkip: () => ipcRenderer.send('reminder-skip'),
    reminderStartNow: () => ipcRenderer.send('reminder-start-now'),
    reminderDismiss: () => ipcRenderer.send('reminder-dismiss'),

    // Tutorial
    finishTutorial: () => ipcRenderer.send('tutorial-finished'),

    // Subscriptions; each returns its own unsubscribe function.
    onShowView: (callback: (view: string) => void) => subscribe<string>('show-view', callback),
    onStartCountdown: (callback: (duration: number) => void) => subscribe<number>('start-countdown', callback),
    onCountdownUpdate: (callback: (countdown: number) => void) => subscribe<number>('countdown-update', callback),
    onDownloadProgress: (callback: (progress: { percent: number; transferredBytes: number; totalBytes: number }) => void) =>
        subscribe<{ percent: number; transferredBytes: number; totalBytes: number }>('download-progress', callback),
}

export type BlinkBlinkApi = typeof api

contextBridge.exposeInMainWorld('api', api)
