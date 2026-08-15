/* Implements local status, controls, and statistics for the LG 2RES2VE300UA2 refrigerator.
 * Related files: cloud/ha_bridge.ts, tests/cloud/devices/2RES2VE300UA2.test.ts. */
import HADevice from './base'
import { Device as Thinq2Device } from '../thinq2/device'
import { type Connection } from '../homeassistant'
import { type Metadata } from '../thinq'
import { allowExtendedType } from '@/util/casting'
import AABBDevice from './aabb_device'
import { dirname, join, resolve } from 'node:path'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'

const STATUS_LENGTH = 68
const DOOR_WARNING_MS = 60_000
const NIGHT_GLARE_MODES = ['비활성', '일출/일몰', '사용자'] as const
type NightGlareMode = (typeof NIGHT_GLARE_MODES)[number]
const NIGHT_GLARE_BRIGHTNESS_OPTIONS = ['0%', '10%', '30%', '50%', '80%', '100%'] as const
type NightGlareBrightness = (typeof NIGHT_GLARE_BRIGHTNESS_OPTIONS)[number]
type NightGlareSettings = { start: string; end: string; brightness: NightGlareBrightness }

type DoorStats = {
    date: string
    count: number
    durationMinutes: number
    openSince?: number
}

type EnergyStats = {
    hour: string
    date: string
    month: string
    hourWh: number
    dayWh: number
    monthWh: number
    totalWh: number
    lastIntervalKey?: number
}

function localDate(timestamp = Date.now()) {
    const parts = new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(timestamp)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value
    return `${part('year')}-${part('month')}-${part('day')}`
}

function localHour(timestamp = Date.now()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(timestamp)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}`
}

function localMonth(timestamp = Date.now()) {
    return localDate(timestamp).slice(0, 7)
}

function dataDirectory() {
    // Production is launched as `rethink-cloud ... /app/data/config.json`. Avoid
    // writing state files from unit tests or when this handler is imported as a library.
    if (!process.argv[1]?.includes('rethink-cloud')) return
    return dirname(resolve(process.argv[2] ?? './config.json'))
}

// Live-captured 118-byte control record for 2RES2VE300UA2. The two temperature
// bytes use zero as "unchanged"; all optional fields use 0xFF unless explicitly
// set below. Several fixed bytes near the end are required by this appliance.
const CONTROL_TEMPLATE =
    'f017ff0000ffffffffffffffffffff00ffffffffffffff000000ffff00ffffffff00ffffffffffffffffff00ffffff1effffffffffffffffffffffffffffffffffffffffffffffff0affffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ffffffffffffffffffffffffffffff'

function dateParts(timestamp: number, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en', {
        timeZone,
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(timestamp)
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0)
    return { year: part('year'), month: part('month'), day: part('day') }
}

function zonedTimeToUtc(
    timestamp: number,
    timeZone: string,
    hour: number,
    minute: number,
    second: number,
    nextDay = false,
) {
    const local = dateParts(timestamp, timeZone)
    const base = new Date(Date.UTC(2000 + local.year, local.month - 1, local.day + (nextDay ? 1 : 0)))
    const target = {
        year: base.getUTCFullYear(),
        month: base.getUTCMonth() + 1,
        day: base.getUTCDate(),
    }
    const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, hour, minute, second)
    let result = targetAsUtc
    for (let attempt = 0; attempt < 2; attempt++) {
        const rendered = new Intl.DateTimeFormat('en', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(result)
        const value = (type: Intl.DateTimeFormatPartTypes) =>
            Number(rendered.find((item) => item.type === type)?.value ?? 0)
        const renderedAsUtc = Date.UTC(
            value('year'),
            value('month') - 1,
            value('day'),
            value('hour'),
            value('minute'),
            value('second'),
        )
        result += targetAsUtc - renderedAsUtc
    }
    return new Date(result)
}

function nightGlareCommand(
    mode: NightGlareMode,
    timestamp: number,
    timeZone: string,
    sun?: { nextSetting: Date; nextRising: Date },
    custom: NightGlareSettings = { start: '21:00:00', end: '06:00:00', brightness: '30%' },
) {
    const brightness = Number.parseInt(custom.brightness, 10)
    if (mode === '비활성') {
        return Buffer.concat([Buffer.from('f010020000000000000000000000000000', 'hex'), Buffer.from([brightness])])
    }

    const local = dateParts(timestamp, timeZone)
    const date = Buffer.from([local.year, local.month, local.day])
    let start: Date
    let end: Date
    let modeByte: number
    if (mode === '일출/일몰' && sun) {
        modeByte = 1
        start = sun.nextSetting
        end = sun.nextRising
    } else {
        modeByte = 2
        const startParts = custom.start.split(':').map(Number)
        const endParts = custom.end.split(':').map(Number)
        const startSeconds = startParts[0] * 3600 + startParts[1] * 60 + startParts[2]
        const endSeconds = endParts[0] * 3600 + endParts[1] * 60 + endParts[2]
        start = zonedTimeToUtc(timestamp, timeZone, startParts[0], startParts[1], startParts[2])
        end = zonedTimeToUtc(timestamp, timeZone, endParts[0], endParts[1], endParts[2], endSeconds <= startSeconds)
    }
    return Buffer.concat([
        Buffer.from([0xf0, 0x10, 0x02, modeByte]),
        date,
        Buffer.from([start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds()]),
        date,
        Buffer.from([end.getUTCHours(), end.getUTCMinutes(), end.getUTCSeconds(), 0, brightness]),
    ])
}

function normalizeTime(value: string) {
    const match = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.exec(value)
    return match ? (value.length === 5 ? `${value}:00` : value) : undefined
}

function fridgeRaw(celsius: number) {
    return 8 - celsius
}

function freezerRaw(celsius: number) {
    return -14 - celsius
}

export default class Device extends AABBDevice {
    constructor(HA: Connection, thinq: Thinq2Device, meta: Metadata) {
        super(HA, thinq)
        this.setConfig(
            allowExtendedType({
                ...HADevice.config(meta, { name: 'LG Refrigerator' }),
                components: {
                    fridge: {
                        platform: 'climate',
                        unique_id: '$deviceid-fridge_climate',
                        name: 'Fridge',
                        temperature_unit: 'C',
                        temperature_state_topic: '$this/fridge_temperature',
                        temperature_command_topic: '$this/fridge_temperature/set',
                        mode_state_topic: '$this/fridge_mode',
                        modes: ['auto'],
                        min_temp: 1,
                        max_temp: 7,
                        temp_step: 1,
                        precision: 1,
                        icon: 'mdi:fridge-top',
                        entity_category: 'config',
                    },
                    freezer: {
                        platform: 'climate',
                        unique_id: '$deviceid-freezer_climate',
                        name: 'Freezer',
                        temperature_unit: 'C',
                        temperature_state_topic: '$this/freezer_temperature',
                        temperature_command_topic: '$this/freezer_temperature/set',
                        mode_state_topic: '$this/freezer_mode',
                        modes: ['auto'],
                        min_temp: -23,
                        max_temp: -15,
                        temp_step: 1,
                        precision: 1,
                        icon: 'mdi:fridge-bottom',
                        entity_category: 'config',
                    },
                    express_cool: {
                        platform: 'switch',
                        unique_id: '$deviceid-express_cool',
                        state_topic: '$this/express_cool',
                        command_topic: '$this/express_cool/set',
                        name: 'Express cool',
                        icon: 'mdi:coolant-temperature',
                    },
                    express_freeze: {
                        platform: 'switch',
                        unique_id: '$deviceid-express_freeze',
                        state_topic: '$this/express_freeze',
                        command_topic: '$this/express_freeze/set',
                        name: 'Express freeze',
                        icon: 'mdi:snowflake',
                    },
                    door: {
                        platform: 'binary_sensor',
                        device_class: 'door',
                        unique_id: '$deviceid-door',
                        state_topic: '$this/door',
                        name: 'Door',
                    },
                    door_open_count_today: {
                        platform: 'sensor',
                        unique_id: '$deviceid-door_open_count_today',
                        state_topic: '$this/door_open_count_today',
                        name: 'Door open count today',
                        unit_of_measurement: '회',
                        state_class: 'total',
                        icon: 'mdi:counter',
                    },
                    door_open_duration_today: {
                        platform: 'sensor',
                        device_class: 'duration',
                        unique_id: '$deviceid-door_open_duration_today',
                        state_topic: '$this/door_open_duration_today',
                        name: 'Door open duration today',
                        unit_of_measurement: 'min',
                        state_class: 'total',
                        suggested_display_precision: 2,
                        icon: 'mdi:timer-outline',
                    },
                    door_open_warning: {
                        platform: 'binary_sensor',
                        device_class: 'problem',
                        unique_id: '$deviceid-door_open_warning',
                        state_topic: '$this/door_open_warning',
                        name: 'Door open warning',
                        icon: 'mdi:fridge-alert-outline',
                    },
                    smart_care_status: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-smart-care-status',
                        state_topic: '$this/smart_care',
                        name: 'Smart care+',
                        icon: 'mdi:creation-outline',
                        entity_category: 'diagnostic',
                    },
                    night_glare_mode: {
                        platform: 'select',
                        unique_id: '$deviceid-night-glare-mode',
                        state_topic: '$this/night_glare_mode',
                        command_topic: '$this/night_glare_mode/set',
                        options: NIGHT_GLARE_MODES,
                        name: 'Night glare prevention mode',
                        icon: 'mdi:brightness-4',
                        entity_category: 'config',
                    },
                    night_glare_start: {
                        platform: 'time',
                        unique_id: '$deviceid-night-glare-start',
                        state_topic: '$this/night_glare_start',
                        command_topic: '$this/night_glare_start/set',
                        name: 'Night glare start time',
                        icon: 'mdi:clock-start',
                        entity_category: 'config',
                    },
                    night_glare_end: {
                        platform: 'time',
                        unique_id: '$deviceid-night-glare-end',
                        state_topic: '$this/night_glare_end',
                        command_topic: '$this/night_glare_end/set',
                        name: 'Night glare end time',
                        icon: 'mdi:clock-end',
                        entity_category: 'config',
                    },
                    night_glare_brightness: {
                        platform: 'select',
                        unique_id: '$deviceid-night-glare-brightness',
                        state_topic: '$this/night_glare_brightness',
                        command_topic: '$this/night_glare_brightness/set',
                        options: NIGHT_GLARE_BRIGHTNESS_OPTIONS,
                        name: 'Night glare brightness',
                        icon: 'mdi:brightness-percent',
                        entity_category: 'config',
                    },
                    energy_current_hour: {
                        platform: 'sensor',
                        device_class: 'energy',
                        unique_id: '$deviceid-energy_current_hour',
                        state_topic: '$this/energy_current_hour',
                        name: '현재 시간 누적 사용량',
                        unit_of_measurement: 'Wh',
                        state_class: 'total',
                        icon: 'mdi:lightning-bolt',
                    },
                    energy_today: {
                        platform: 'sensor',
                        device_class: 'energy',
                        unique_id: '$deviceid-energy_today',
                        state_topic: '$this/energy_today',
                        name: '오늘 누적 사용량',
                        unit_of_measurement: 'kWh',
                        state_class: 'total',
                        suggested_display_precision: 3,
                        icon: 'mdi:calendar-today',
                    },
                    energy_month: {
                        platform: 'sensor',
                        device_class: 'energy',
                        unique_id: '$deviceid-energy_month',
                        state_topic: '$this/energy_month',
                        name: '금월 누적 사용량',
                        unit_of_measurement: 'kWh',
                        state_class: 'total',
                        suggested_display_precision: 3,
                        icon: 'mdi:calendar-month',
                    },
                    energy_total: {
                        platform: 'sensor',
                        device_class: 'energy',
                        unique_id: '$deviceid-energy_total',
                        state_topic: '$this/energy_total',
                        name: '총 누적 사용량',
                        unit_of_measurement: 'kWh',
                        state_class: 'total_increasing',
                        suggested_display_precision: 3,
                        icon: 'mdi:counter',
                    },
                },
            }),
            {
                fresh_air_filter: { platform: 'sensor' },
                smart_care: { platform: 'switch' },
                night_glare: { platform: 'switch' },
                night_glare_status: { platform: 'binary_sensor' },
            },
        )
        this.doorStats = this.loadDoorStats()
        this.energyStats = this.loadEnergyStats()
        this.loadNightGlareSettings()
        this.schedulePeriodReset()
        this.publishDoorStats()
        this.publishEnergyStats()
        this.publishNightGlareSettings()
    }

    private doorOpen?: boolean
    private doorWarningTimer?: NodeJS.Timeout
    private midnightTimer?: NodeJS.Timeout
    private doorStats: DoorStats
    private energyStats: EnergyStats
    private now = () => Date.now()
    private nightGlareMode: NightGlareMode = '비활성'
    private nightGlareSettings: NightGlareSettings = { start: '21:00:00', end: '06:00:00', brightness: '30%' }

    start() {
        this.send(Buffer.from('F0ED1211010000010400', 'hex'))
    }

    processAABB(buf: Buffer) {
        if (buf.equals(Buffer.from('10001000', 'hex'))) return
        if (buf[0] !== 0x10) return
        if (buf[1] === 0xeb && buf.length === 2 + STATUS_LENGTH) {
            this.processStatus(buf.subarray(2))
        } else if (buf[1] === 0xec && buf.length === 2 + STATUS_LENGTH * 2) {
            this.processStatus(buf.subarray(2 + STATUS_LENGTH))
        } else if (buf[1] === 0xaf && buf.length === 5 && (buf[2] === 0x0f || buf[2] === 0x10)) {
            this.processEnergyInterval(buf.readUInt16BE(3))
        }
    }

    private processStatus(rec: Buffer) {
        this.publishProperty('fridge_temperature', fridgeRaw(rec[1]))
        this.publishProperty('freezer_temperature', freezerRaw(rec[2]))
        this.publishProperty('fridge_mode', 'auto')
        this.publishProperty('freezer_mode', 'auto')
        this.publishProperty('express_freeze', rec[3] === 2 ? 'ON' : 'OFF')
        this.publishProperty('express_cool', rec[16] === 1 ? 'ON' : 'OFF')
        this.processDoor(rec[7] === 1)
        this.publishProperty('smart_care', rec[17] === 1 ? 'ON' : 'OFF')
        this.nightGlareMode = rec[30] === 2 ? '일출/일몰' : rec[30] === 3 ? '사용자' : '비활성'
        this.publishProperty('night_glare_mode', this.nightGlareMode)
    }

    private loadNightGlareSettings() {
        const saved = this.HA.getPersistentDeviceState(this.id)['refrigeratorNightGlare'] as
            | Partial<NightGlareSettings>
            | undefined
        const start = normalizeTime(String(saved?.start ?? ''))
        const end = normalizeTime(String(saved?.end ?? ''))
        const brightness = String(saved?.brightness ?? '') as NightGlareBrightness
        if (start && end)
            this.nightGlareSettings = {
                start,
                end,
                brightness: NIGHT_GLARE_BRIGHTNESS_OPTIONS.includes(brightness) ? brightness : '30%',
            }
    }

    private persistNightGlareSettings() {
        const state = this.HA.getPersistentDeviceState(this.id)
        state['refrigeratorNightGlare'] = { ...this.nightGlareSettings }
        this.HA.setPersistentDeviceState(this.id, state)
    }

    private publishNightGlareSettings() {
        this.publishProperty('night_glare_start', this.nightGlareSettings.start)
        this.publishProperty('night_glare_end', this.nightGlareSettings.end)
        this.publishProperty('night_glare_brightness', this.nightGlareSettings.brightness)
    }

    private statsPath() {
        const dir = dataDirectory()
        return dir ? join(dir, `refrigerator-door-${this.id}.json`) : undefined
    }

    private loadDoorStats(): DoorStats {
        const empty = { date: localDate(), count: 0, durationMinutes: 0 }
        const path = this.statsPath()
        if (!path) return empty
        try {
            const saved = JSON.parse(readFileSync(path, 'utf-8')) as DoorStats
            if (saved.date !== empty.date) return empty
            return {
                date: saved.date,
                count: Number(saved.count) || 0,
                durationMinutes: Number(saved.durationMinutes) || 0,
                ...(saved.openSince ? { openSince: Number(saved.openSince) } : {}),
            }
        } catch {
            return empty
        }
    }

    private saveDoorStats() {
        const path = this.statsPath()
        if (!path) return
        const temporary = `${path}.tmp`
        try {
            writeFileSync(temporary, JSON.stringify(this.doorStats))
            renameSync(temporary, path)
        } catch (err) {
            console.warn(`Unable to save refrigerator door statistics: ${err}`)
        }
    }

    private energyStatsPath() {
        const dir = dataDirectory()
        return dir ? join(dir, `refrigerator-energy-${this.id}.json`) : undefined
    }

    private loadEnergyStats(now = Date.now()): EnergyStats {
        const current = {
            hour: localHour(now),
            date: localDate(now),
            month: localMonth(now),
        }
        const empty: EnergyStats = { ...current, hourWh: 0, dayWh: 0, monthWh: 0, totalWh: 0 }
        const path = this.energyStatsPath()
        if (!path) return empty
        try {
            const saved = JSON.parse(readFileSync(path, 'utf-8')) as EnergyStats
            return {
                ...current,
                hourWh: saved.hour === current.hour ? Number(saved.hourWh) || 0 : 0,
                dayWh: saved.date === current.date ? Number(saved.dayWh) || 0 : 0,
                monthWh: saved.month === current.month ? Number(saved.monthWh) || 0 : 0,
                totalWh: Number.isFinite(saved.totalWh)
                    ? Number(saved.totalWh)
                    : saved.month === current.month
                      ? Number(saved.monthWh) || 0
                      : 0,
                ...(Number.isFinite(saved.lastIntervalKey) ? { lastIntervalKey: Number(saved.lastIntervalKey) } : {}),
            }
        } catch {
            return empty
        }
    }

    private saveEnergyStats() {
        const path = this.energyStatsPath()
        if (!path) return
        const temporary = `${path}.tmp`
        try {
            writeFileSync(temporary, JSON.stringify(this.energyStats))
            renameSync(temporary, path)
        } catch (err) {
            console.warn(`Unable to save refrigerator energy statistics: ${err}`)
        }
    }

    private publishEnergyStats() {
        this.publishProperty('energy_current_hour', this.energyStats.hourWh)
        this.publishProperty('energy_today', Number((this.energyStats.dayWh / 1000).toFixed(3)))
        this.publishProperty('energy_month', Number((this.energyStats.monthWh / 1000).toFixed(3)))
        this.publishProperty('energy_total', Number((this.energyStats.totalWh / 1000).toFixed(3)))
    }

    private processEnergyInterval(intervalWh: number, now = Date.now()) {
        this.rollEnergyPeriods(now)
        const intervalKey = Math.floor(now / (15 * 60_000))
        if (this.energyStats.lastIntervalKey === intervalKey) return

        this.energyStats.lastIntervalKey = intervalKey
        this.energyStats.hourWh += intervalWh
        this.energyStats.dayWh += intervalWh
        this.energyStats.monthWh += intervalWh
        this.energyStats.totalWh += intervalWh
        this.publishEnergyStats()
        this.saveEnergyStats()
    }

    private rollEnergyPeriods(now = Date.now()) {
        const hour = localHour(now)
        const date = localDate(now)
        const month = localMonth(now)
        let changed = false

        if (this.energyStats.month !== month) {
            this.energyStats.month = month
            this.energyStats.monthWh = 0
            changed = true
        }
        if (this.energyStats.date !== date) {
            this.energyStats.date = date
            this.energyStats.dayWh = 0
            changed = true
        }
        if (this.energyStats.hour !== hour) {
            this.energyStats.hour = hour
            this.energyStats.hourWh = 0
            changed = true
        }

        if (changed) {
            this.publishEnergyStats()
            this.saveEnergyStats()
        }
    }

    private publishDoorStats() {
        this.publishProperty('door_open_count_today', this.doorStats.count)
        this.publishProperty('door_open_duration_today', Number(this.doorStats.durationMinutes.toFixed(2)))
        this.publishProperty('door_open_warning', 'OFF')
    }

    private processDoor(open: boolean, now = Date.now()) {
        this.rollDoorStatsDay(now)
        this.publishProperty('door', open ? 'ON' : 'OFF')

        if (this.doorOpen === open) return
        const previous = this.doorOpen
        this.doorOpen = open

        if (open) {
            if (previous === false) this.doorStats.count++
            this.doorStats.openSince = now
            this.publishProperty('door_open_count_today', this.doorStats.count)
            this.publishProperty('door_open_warning', 'OFF')
            if (this.doorWarningTimer) clearTimeout(this.doorWarningTimer)
            this.doorWarningTimer = setTimeout(() => {
                if (this.doorOpen) this.publishProperty('door_open_warning', 'ON')
            }, DOOR_WARNING_MS)
            this.doorWarningTimer.unref()
        } else {
            if (this.doorWarningTimer) clearTimeout(this.doorWarningTimer)
            this.doorWarningTimer = undefined
            if (this.doorStats.openSince) {
                this.doorStats.durationMinutes += Math.max(0, now - this.doorStats.openSince) / 60_000
                delete this.doorStats.openSince
                this.publishProperty('door_open_duration_today', Number(this.doorStats.durationMinutes.toFixed(2)))
            }
            this.publishProperty('door_open_warning', 'OFF')
        }
        this.saveDoorStats()
    }

    private rollDoorStatsDay(now = Date.now()) {
        const today = localDate(now)
        if (this.doorStats.date === today) return
        this.doorStats = {
            date: today,
            count: 0,
            durationMinutes: 0,
            ...(this.doorOpen ? { openSince: now } : {}),
        }
        this.publishDoorStats()
        this.saveDoorStats()
    }

    private schedulePeriodReset() {
        // Keep time-window sensors correct even if the refrigerator sends no state
        // packet exactly on an hour, day or month boundary.
        this.midnightTimer = setInterval(() => {
            this.rollDoorStatsDay()
            this.rollEnergyPeriods()
        }, 60_000)
        this.midnightTimer.unref()
    }

    private sendSetting(statusOffset: number, value: number) {
        const command = Buffer.from(CONTROL_TEMPLATE, 'hex')
        command[2 + statusOffset] = value
        this.send(command)
    }

    private async setNightGlareMode(mode: NightGlareMode) {
        this.nightGlareMode = mode
        const config = await this.HA.getHomeAssistantConfig()
        const timeZone = typeof config?.time_zone === 'string' ? config.time_zone : 'Asia/Seoul'
        if (mode === '일출/일몰') {
            const state = await this.HA.getHomeAssistantState('sun.sun')
            const attributes = state?.attributes as Record<string, unknown> | undefined
            const nextSetting = new Date(String(attributes?.next_setting ?? ''))
            const nextRising = new Date(String(attributes?.next_rising ?? ''))
            if (Number.isFinite(nextSetting.getTime()) && Number.isFinite(nextRising.getTime())) {
                this.send(
                    nightGlareCommand(mode, this.now(), timeZone, { nextSetting, nextRising }, this.nightGlareSettings),
                )
                return
            }
            console.warn('Home Assistant sun.sun was unavailable; using the custom night-glare schedule')
            mode = '사용자'
            this.nightGlareMode = mode
        }
        this.send(nightGlareCommand(mode, this.now(), timeZone, undefined, this.nightGlareSettings))
    }

    private setNightGlareTime(property: 'start' | 'end', mqttValue: string) {
        const value = normalizeTime(mqttValue)
        if (!value) return
        this.nightGlareSettings[property] = value
        this.persistNightGlareSettings()
        this.publishNightGlareSettings()
        if (this.nightGlareMode === '사용자') void this.setNightGlareMode('사용자')
    }

    private setNightGlareBrightness(mqttValue: string) {
        if (!NIGHT_GLARE_BRIGHTNESS_OPTIONS.includes(mqttValue as NightGlareBrightness)) return
        this.nightGlareSettings.brightness = mqttValue as NightGlareBrightness
        this.persistNightGlareSettings()
        this.publishNightGlareSettings()
        void this.setNightGlareMode(this.nightGlareMode)
    }

    setProperty(prop: string, mqttValue: string) {
        if (prop === 'fridge_temperature') {
            this.sendSetting(1, fridgeRaw(Number(mqttValue)))
        } else if (prop === 'freezer_temperature') {
            this.sendSetting(2, freezerRaw(Number(mqttValue)))
        } else if (prop === 'express_cool') {
            this.sendSetting(16, mqttValue === 'ON' ? 1 : 0)
        } else if (prop === 'express_freeze') {
            this.sendSetting(3, mqttValue === 'ON' ? 2 : 1)
        } else if (prop === 'night_glare_mode' && NIGHT_GLARE_MODES.includes(mqttValue as NightGlareMode)) {
            void this.setNightGlareMode(mqttValue as NightGlareMode)
        } else if (prop === 'night_glare_start') {
            this.setNightGlareTime('start', mqttValue)
        } else if (prop === 'night_glare_end') {
            this.setNightGlareTime('end', mqttValue)
        } else if (prop === 'night_glare_brightness') {
            this.setNightGlareBrightness(mqttValue)
        }
    }
}
