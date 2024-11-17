
import { WeeklySchedule } from './types'
import { getSettings } from './store'

export class ScheduleManager {
    private static instance: ScheduleManager
    private readonly DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

    private constructor() {}

    static getInstance(): ScheduleManager {
        if (!ScheduleManager.instance) {
            ScheduleManager.instance = new ScheduleManager()
        }
        return ScheduleManager.instance
    }

    isEnabled(): boolean {
        return getSettings().scheduleEnabled
    }

    private getTimeStr(date: Date): string {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }

    private getDaySchedule(date: Date) {
        const settings = getSettings()
        const day = this.DAYS[date.getDay()]
        return settings.schedule[day]
    }

    isWithinActiveHours(date: Date = new Date()): boolean {
        if (!this.isEnabled()) return true

        const daySchedule = this.getDaySchedule(date)
        if (!daySchedule?.enabled || !Array.isArray(daySchedule.timeRanges)) {
            return false
        }

        const timeStr = this.getTimeStr(date)
        return daySchedule.timeRanges
            .sort((a, b) => a.start.localeCompare(b.start))
            .some(range => timeStr >= range.start && timeStr < range.end)
    }

    getCurrentRangeEnd(date: Date = new Date()): Date | null {
        if (!this.isEnabled()) return null

        const daySchedule = this.getDaySchedule(date)
        if (!daySchedule?.enabled || !Array.isArray(daySchedule.timeRanges)) {
            return null
        }

        const timeStr = this.getTimeStr(date)
        const currentRange = daySchedule.timeRanges
            .sort((a, b) => a.start.localeCompare(b.start))
            .find(range => timeStr >= range.start && timeStr < range.end)

        if (currentRange) {
            const [endHour, endMin] = currentRange.end.split(':').map(Number)
            const endTime = new Date(date)
            endTime.setHours(endHour, endMin, 0, 0)
            return endTime
        }

        return null
    }

    getNextActiveTime(): Date | null {
        if (!this.isEnabled()) return null

        const now = new Date()
        const timeStr = this.getTimeStr(now)
        const todayIdx = now.getDay()

        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const checkDate = new Date(now)
            checkDate.setDate(now.getDate() + dayOffset)
            const schedule = this.getDaySchedule(checkDate)

            if (!schedule?.enabled) continue

            const sortedRanges = [...schedule.timeRanges].sort((a, b) => a.start.localeCompare(b.start))
            for (const range of sortedRanges) {
                const [startHour, startMin] = range.start.split(':').map(Number)
                const startTime = new Date(checkDate)
                startTime.setHours(startHour, startMin, 0, 0)

                if (dayOffset === 0) {
                    if (timeStr >= range.start && timeStr < range.end) return now
                    if (timeStr < range.start) return startTime
                    continue
                }

                return startTime
            }
        }

        return null
    }
}

export const scheduleManager = ScheduleManager.getInstance()