import { contextBridge, ipcRenderer, shell } from 'electron'

contextBridge.exposeInMainWorld('api', {
    // System
    platform: process.platform,

    // Data Access
    getSettings: () => ipcRenderer.invoke('get-settings'),
    getStats: () => ipcRenderer.invoke('get-stats'),
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),
    getAvailableSounds: () => ipcRenderer.invoke('get-available-sounds'),
    getSoundPath: (filename: string) => ipcRenderer.invoke('get-sound-path', filename),

    // Actions
    saveSettings: (settings: any) => ipcRenderer.send('save-settings', settings),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    openExternal: (url: string) => shell.openExternal(url),
    
    // Window/Break Actions
    dismissSummary: () => ipcRenderer.send('summary-dismissed'),
    skipBreak: () => ipcRenderer.send('break-skip'),
    
    // Listeners
    onShowView: (callback: (view: any) => void) => ipcRenderer.on('show-view', (_, view) => callback(view)),
    onStartCountdown: (callback: (duration: number) => void) => ipcRenderer.on('start-countdown', (_, duration) => callback(duration)),
    onCountdownUpdate: (callback: (countdown: number) => void) => ipcRenderer.on('countdown-update', (_, countdown) => callback(countdown)),
    onDownloadProgress: (callback: (progress: any) => void) => ipcRenderer.on('download-progress', (_, progress) => callback(progress)),
    
    // Cleanup listeners
    removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
})
