/* Implements confirmed ThinQ 1 controls and filter telemetry for AIR_910604_WW.
 * Related files: cloud/ha_bridge.ts, tests/cloud/devices/AIR_910604_WW.test.ts. */
import HADevice from './base'
import { Device as Thinq1Device } from '../thinq1/device'
import { type Connection } from '../homeassistant'
import { type Metadata } from '../thinq'
import { allowExtendedType } from '@/util/casting'

const SLEEP_TIMER_VALUES: Record<string, string> = {
    Off: '0',
    '2 hours': '120',
    '4 hours': '240',
    '8 hours': '480',
    '12 hours': '720',
}

type FilterStatus = {
    RemainTime?: unknown
    ChangePeriod?: unknown
}

export default class Device extends HADevice {
    constructor(
        HA: Connection,
        readonly thinq: Thinq1Device,
        meta: Metadata,
    ) {
        super(HA, thinq.id)
        this.setConfig(
            allowExtendedType({
                ...HADevice.config(meta, { name: 'LG Air Purifier' }),
                components: {
                    power: {
                        platform: 'switch',
                        unique_id: '$deviceid-power',
                        command_topic: '$this/power/set',
                        name: '',
                        icon: 'mdi:air-purifier',
                    },
                    air_fast: {
                        platform: 'switch',
                        unique_id: '$deviceid-air-fast',
                        command_topic: '$this/air_fast/set',
                        name: 'Fast mode',
                        icon: 'mdi:fan-plus',
                    },
                    air_removal: {
                        platform: 'switch',
                        unique_id: '$deviceid-air-removal',
                        command_topic: '$this/air_removal/set',
                        name: 'Air sterilization',
                        icon: 'mdi:air-filter',
                    },
                    sleep_timer: {
                        platform: 'select',
                        unique_id: '$deviceid-sleep-timer',
                        command_topic: '$this/sleep_timer/set',
                        options: Object.keys(SLEEP_TIMER_VALUES),
                        name: 'Sleep timer',
                        icon: 'mdi:timer-sand',
                        entity_category: 'config',
                    },
                    filter_remaining_time: {
                        platform: 'sensor',
                        unique_id: '$deviceid-filter-remaining-time',
                        state_topic: '$this/filter_remaining_time',
                        name: 'Filter remaining time',
                        icon: 'mdi:air-filter',
                        unit_of_measurement: 'h',
                        device_class: 'duration',
                        state_class: 'measurement',
                    },
                    filter_remaining: {
                        platform: 'sensor',
                        unique_id: '$deviceid-filter-remaining',
                        state_topic: '$this/filter_remaining',
                        name: 'Filter remaining',
                        icon: 'mdi:air-filter',
                        unit_of_measurement: '%',
                        state_class: 'measurement',
                    },
                },
            }),
        )

        thinq.on('data', (buf) => this.processData(buf))
    }

    start() {
        this.thinq.send({ Cmd: 'Config', CmdOpt: 'Get', Value: 'MFilter', Data: 'bnVsbA==' })
    }

    private processData(buf: Buffer) {
        let status: FilterStatus
        try {
            status = JSON.parse(buf.toString('utf-8')) as FilterStatus
        } catch {
            return
        }

        const remainTime = Number(status.RemainTime)
        const changePeriod = Number(status.ChangePeriod)
        if (!Number.isFinite(remainTime) || !Number.isFinite(changePeriod) || remainTime < 0 || changePeriod <= 0)
            return

        this.HA.publishProperty(this.id, 'filter_remaining_time', remainTime)
        const remainingPercent = Math.min(100, Math.round((remainTime / changePeriod) * 1000) / 10)
        this.HA.publishProperty(this.id, 'filter_remaining', remainingPercent)
    }

    setProperty(prop: string, mqttValue: string) {
        if (prop === 'power' && (mqttValue === 'ON' || mqttValue === 'OFF')) {
            this.thinq.send({ Cmd: 'Control', CmdOpt: 'Operation', Value: mqttValue === 'ON' ? '1' : '0' })
        } else if (prop === 'air_fast' && (mqttValue === 'ON' || mqttValue === 'OFF')) {
            this.thinq.send({
                Cmd: 'Control',
                CmdOpt: 'Set',
                Value: { AirFast: mqttValue === 'ON' ? '1' : '0' },
            })
        } else if (prop === 'air_removal' && (mqttValue === 'ON' || mqttValue === 'OFF')) {
            this.thinq.send({
                Cmd: 'Control',
                CmdOpt: 'Set',
                Value: { AirRemoval: mqttValue === 'ON' ? '1' : '0' },
            })
        } else if (prop === 'sleep_timer' && SLEEP_TIMER_VALUES[mqttValue] !== undefined) {
            this.thinq.send({
                Cmd: 'Control',
                CmdOpt: 'Set',
                Value: { SleepTime: SLEEP_TIMER_VALUES[mqttValue] },
                Data: 'bnVsbA==',
            })
        }
    }
}
