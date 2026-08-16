/* Verifies captured status, control, discovery, door, and energy behavior for 2RES2VE300UA2.
 * Related files: cloud/devices/2RES2VE300UA2.ts, cloud/ha_bridge.ts. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import DUT from '@/cloud/devices/2RES2VE300UA2'
import type { Metadata } from '@/cloud/thinq'
import { MockHAConnection, MockThinq2Device, buf, hex } from '@/tests/helpers/mocks'

const DEVICE_ID = 'test-id'
const META: Metadata = { modelId: '2RES2VE300UA2', modelName: '2RES2VE300UA2', swVersion: '' }
const LIVE_STATUS = buf(
    'aa4a10eb0205040107000000010001ffffff00ff0001ffffffffffffff02020103ff000001ff00ffffffffff01ff00' +
        'ffffffffffffffffffffffffffffffffffffffff0078ff00000abb',
)

function makeDevice() {
    const ha = new MockHAConnection()
    const thinq = new MockThinq2Device(DEVICE_ID, META)
    const dev = new DUT(ha.asConnection(), thinq, META)
    return { ha, thinq, dev }
}

describe('2RES2VE300UA2', () => {
    test('exposes the supported refrigerator components', () => {
        const { ha } = makeDevice()
        const c = ha.devices[DEVICE_ID].config!.components as Record<string, unknown>
        for (const name of [
            'fridge',
            'freezer',
            'express_cool',
            'express_freeze',
            'door',
            'door_open_count_today',
            'door_open_duration_today',
            'door_open_warning',
            'fresh_air_filter',
            'display_lock_status',
            'smart_care',
            'night_glare_mode',
            'night_glare_start',
            'night_glare_end',
            'night_glare_brightness',
            'energy_current_hour',
            'energy_today',
            'energy_month',
            'energy_total',
        ])
            assert.ok(c[name], name)
        assert.equal((c.fridge as { platform: string }).platform, 'climate')
        assert.equal((c.freezer as { platform: string }).platform, 'climate')
        assert.equal((c.fridge as { entity_category: string }).entity_category, 'config')
        assert.equal((c.freezer as { entity_category: string }).entity_category, 'config')
        assert.equal((c.smart_care as { platform: string }).platform, 'switch')
        assert.equal((c.smart_care as { command_topic: string }).command_topic, '$this/smart_care/set')
        assert.equal((c.fresh_air_filter as { platform: string }).platform, 'sensor')
        assert.equal((c.fresh_air_filter as { command_topic?: string }).command_topic, undefined)
        assert.equal((c.display_lock_status as { platform: string }).platform, 'sensor')
        assert.equal((c.display_lock_status as { command_topic?: string }).command_topic, undefined)
        assert.equal((c.night_glare_mode as { platform: string }).platform, 'select')
        assert.deepEqual((c.night_glare_mode as { options: string[] }).options, ['비활성', '일출/일몰', '사용자'])
        assert.equal((c.night_glare_mode as { entity_category: string }).entity_category, 'config')
        assert.equal((c.night_glare_mode as { command_topic?: string }).command_topic, '$this/night_glare_mode/set')
        assert.equal((c.night_glare_start as { platform: string }).platform, 'time')
        assert.equal((c.night_glare_end as { platform: string }).platform, 'time')
        assert.equal((c.night_glare_start as { entity_category: string }).entity_category, 'config')
        assert.equal((c.night_glare_end as { entity_category: string }).entity_category, 'config')
        assert.equal((c.night_glare_brightness as { platform: string }).platform, 'select')
        assert.deepEqual((c.night_glare_brightness as { options: string[] }).options, [
            '0%',
            '10%',
            '30%',
            '50%',
            '80%',
            '100%',
        ])
        assert.equal((c.night_glare_brightness as { entity_category: string }).entity_category, 'config')
        assert.equal((c.energy_today as { unit_of_measurement: string }).unit_of_measurement, 'kWh')
        assert.equal((c.energy_total as { unit_of_measurement: string }).unit_of_measurement, 'kWh')
        assert.equal((c.energy_total as { state_class: string }).state_class, 'total_increasing')
        for (const name of ['energy_current_hour', 'energy_today', 'energy_month', 'energy_total'])
            assert.equal((c[name] as { suggested_display_precision: number }).suggested_display_precision, 2, name)
        assert.equal(c.flex_setpoint, undefined)
    })

    test('removes legacy discovery components before publishing the current config', () => {
        const { ha } = makeDevice()
        assert.equal(ha.publishedConfigs.length, 2)
        const removal = ha.publishedConfigs[0].components
        assert.deepEqual(removal.fresh_air_filter, { platform: 'sensor' })
        assert.deepEqual(removal.smart_care, { platform: 'switch' })
        assert.deepEqual(removal.smart_care_status, { platform: 'binary_sensor' })
        assert.deepEqual(removal.night_glare, { platform: 'switch' })
        assert.deepEqual(removal.night_glare_status, { platform: 'binary_sensor' })
        const current = ha.publishedConfigs[1].components
        assert.equal(current.fresh_air_filter.platform, 'sensor')
        assert.equal(current.smart_care.platform, 'switch')
        assert.equal(current.smart_care_status, undefined)
        assert.equal(current.night_glare, undefined)
        assert.equal(current.night_glare_status, undefined)
    })

    test('counts door openings and accumulates only completed open time', () => {
        const { ha, dev } = makeDevice()
        const processDoor = (dev as unknown as { processDoor: (open: boolean, now: number) => void }).processDoor.bind(
            dev,
        )

        processDoor(false, 1_000)
        processDoor(true, 2_000)
        processDoor(true, 5_000)
        assert.equal(ha.devices[DEVICE_ID].properties.door_open_count_today, 1)
        assert.equal(ha.devices[DEVICE_ID].properties.door_open_duration_today, 0)

        processDoor(false, 12_000)
        assert.equal(ha.devices[DEVICE_ID].properties.door_open_duration_today, 0.17)
        assert.equal(ha.devices[DEVICE_ID].properties.door_open_warning, 'OFF')
    })

    test('decodes the live status consistently with smartthinq_sensors', () => {
        const { ha, thinq } = makeDevice()
        thinq.emit('data', LIVE_STATUS)
        const p = ha.devices[DEVICE_ID].properties
        assert.equal(p.fridge_temperature, 3)
        assert.equal(p.freezer_temperature, -18)
        assert.equal(p.fridge_mode, 'auto')
        assert.equal(p.freezer_mode, 'auto')
        assert.equal(p.express_cool, 'OFF')
        assert.equal(p.express_freeze, 'OFF')
        assert.equal(p.door, 'OFF')
        assert.equal(p.smart_care, 'ON')
        assert.equal(p.fresh_air_filter, '스마트케어/진단 중')
        assert.equal(p.display_lock_status, 1)
        assert.equal(p.night_glare_mode, '비활성')
    })

    test('publishes the display-lock raw status without assuming unverified polarity', () => {
        const { ha, dev } = makeDevice()
        const processStatus = (dev as unknown as { processStatus: (status: Buffer) => void }).processStatus.bind(dev)
        const status = Buffer.alloc(68, 0xff)

        for (const raw of [0, 1, 2]) {
            status[10] = raw
            processStatus(status)
            assert.equal(ha.devices[DEVICE_ID].properties.display_lock_status, raw)
        }
    })

    test('maps observed and shared Pure N Fresh status values without hiding unknown raw values', () => {
        const { ha, dev } = makeDevice()
        const processStatus = (dev as unknown as { processStatus: (status: Buffer) => void }).processStatus.bind(dev)
        const status = Buffer.alloc(68, 0xff)

        for (const [raw, expected] of [
            [1, '꺼짐'],
            [2, '자동'],
            [3, '파워'],
            [4, '필터 교체 필요'],
            [7, '스마트케어/진단 중'],
            [9, '알 수 없음 (9)'],
        ] as const) {
            status[4] = raw
            processStatus(status)
            assert.equal(ha.devices[DEVICE_ID].properties.fresh_air_filter, expected)
        }
    })

    test('accumulates energy reports and ignores retransmits in the compatibility window', () => {
        const { ha, dev } = makeDevice()
        const processEnergy = (
            dev as unknown as { processEnergyInterval: (intervalWh: number, now: number) => void }
        ).processEnergyInterval.bind(dev)
        const firstInterval = Date.UTC(2026, 6, 29, 0, 13)
        const secondInterval = Date.UTC(2026, 6, 29, 0, 28)

        processEnergy(31, firstInterval)
        processEnergy(31, firstInterval + 1_000)
        processEnergy(33, secondInterval)

        const properties = ha.devices[DEVICE_ID].properties
        assert.equal(properties.energy_current_hour, 64)
        assert.equal(properties.energy_today, 0.064)
        assert.equal(properties.energy_month, 0.064)
        assert.equal(properties.energy_total, 0.064)
    })

    test('decodes the captured 10AF interval value as big-endian Wh', () => {
        const { ha, thinq } = makeDevice()
        thinq.emit('data', buf('AA0910AF0F0021F7BB'))
        assert.equal(ha.devices[DEVICE_ID].properties.energy_current_hour, 33)
        assert.equal(ha.devices[DEVICE_ID].properties.energy_today, 0.033)
        assert.equal(ha.devices[DEVICE_ID].properties.energy_month, 0.033)
        assert.equal(ha.devices[DEVICE_ID].properties.energy_total, 0.033)
    })

    test('accepts the captured 10AF subtype 10 interval report', () => {
        const { ha, thinq } = makeDevice()
        thinq.emit('data', buf('AA0910AF10005A89BB'))
        assert.equal(ha.devices[DEVICE_ID].properties.energy_current_hour, 90)
        assert.equal(ha.devices[DEVICE_ID].properties.energy_today, 0.09)
        assert.equal(ha.devices[DEVICE_ID].properties.energy_month, 0.09)
        assert.equal(ha.devices[DEVICE_ID].properties.energy_total, 0.09)
    })

    test('resets hour, day and month totals on Korea-time boundaries', () => {
        const { ha, dev } = makeDevice()
        const processEnergy = (
            dev as unknown as { processEnergyInterval: (intervalWh: number, now: number) => void }
        ).processEnergyInterval.bind(dev)
        processEnergy(31, Date.parse('2026-07-31T14:58:00Z'))
        processEnergy(33, Date.parse('2026-07-31T15:13:00Z'))
        const properties = ha.devices[DEVICE_ID].properties
        assert.equal(properties.energy_current_hour, 33)
        assert.equal(properties.energy_today, 0.033)
        assert.equal(properties.energy_month, 0.033)
        assert.equal(properties.energy_total, 0.064)
    })

    test('migrates the saved current-month energy to the lifetime total baseline', () => {
        const storagePath = mkdtempSync(join(tmpdir(), 'rethink-refrigerator-energy-'))
        const originalScript = process.argv[1]
        const originalConfig = process.argv[2]
        process.argv[1] = 'rethink-cloud'
        process.argv[2] = join(storagePath, 'config.json')
        writeFileSync(
            join(storagePath, `refrigerator-energy-${DEVICE_ID}.json`),
            JSON.stringify({
                hour: '2026-08-15T12',
                date: '2026-08-15',
                month: '2026-08',
                hourWh: 29,
                dayWh: 320,
                monthWh: 640,
            }),
        )

        try {
            const { dev } = makeDevice()
            const loadEnergy = (
                dev as unknown as {
                    loadEnergyStats: (now: number) => { monthWh: number; totalWh: number }
                }
            ).loadEnergyStats.bind(dev)
            const migrated = loadEnergy(Date.parse('2026-08-15T03:00:00Z'))
            assert.equal(migrated.monthWh, 640)
            assert.equal(migrated.totalWh, 640)
        } finally {
            process.argv[1] = originalScript
            if (originalConfig === undefined) delete process.argv[2]
            else process.argv[2] = originalConfig
            rmSync(storagePath, { recursive: true, force: true })
        }
    })

    test('writes the live-captured fridge and freezer command layouts', () => {
        const { thinq, dev } = makeDevice()
        thinq.resetRecorder()
        dev.setProperty('fridge_temperature', '4')
        assert.equal(
            hex(thinq.outbox[0]),
            'AA7CF017FF0400FFFFFFFFFFFFFFFFFFFF00FFFFFFFFFFFFFF000000FFFF00FFFFFFFF00FFFFFFFFFFFFFFFFFF00FFFFFF1EFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0AFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFBABB',
        )
        thinq.resetRecorder()
        dev.setProperty('freezer_temperature', '-19')
        assert.equal(
            hex(thinq.outbox[0]),
            'AA7CF017FF0005FFFFFFFFFFFFFFFFFFFF00FFFFFFFFFFFFFF000000FFFF00FFFFFFFF00FFFFFFFFFFFFFFFFFF00FFFFFF1EFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0AFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFA5BB',
        )
    })

    test('writes express controls at their validated offsets', () => {
        const { thinq, dev } = makeDevice()
        dev.setProperty('express_cool', 'ON')
        assert.equal(thinq.outbox[0][4 + 16], 1)
        thinq.resetRecorder()
        dev.setProperty('express_freeze', 'ON')
        assert.equal(thinq.outbox[0][4 + 3], 2)
    })

    test('writes the captured Smart Care+ ON and OFF commands and follows device status', () => {
        const { ha, thinq, dev } = makeDevice()
        dev.setProperty('smart_care', 'ON')
        assert.equal(
            hex(thinq.outbox[0]),
            'AA7CF017FF0000FFFFFFFFFFFFFFFFFFFF00FFFFFF01FFFFFF000000FFFF00FFFFFFFF00FFFFFFFFFFFFFFFFFF00FFFFFF1EFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0AFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFB8BB',
        )

        thinq.resetRecorder()
        dev.setProperty('smart_care', 'OFF')
        assert.equal(
            hex(thinq.outbox[0]),
            'AA7CF017FF0000FFFFFFFFFFFFFFFFFFFF00FFFFFF00FFFFFF000000FFFF00FFFFFFFF00FFFFFFFFFFFFFFFFFF00FFFFFF1EFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0AFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFB9BB',
        )

        thinq.emit(
            'data',
            buf(
                'AA8E10EC0206060107000000010001FFFFFF00FF0001FFFFFFFFFFFFFF020F0103FF030001FF00FFFFFFFFFF01FF00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0078FF00000206060102000000010001FFFFFF00FF0000FFFFFFFFFFFFFF020F0103FF030001FF00FFFFFFFFFF01FF00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0078FF000061BB',
            ),
        )
        assert.equal(ha.devices[DEVICE_ID].properties.smart_care, 'OFF')
        assert.equal(ha.devices[DEVICE_ID].properties.fresh_air_filter, '자동')
    })

    test('maps night-glare status values to all three selector modes', () => {
        const { ha, dev } = makeDevice()
        const processStatus = (dev as unknown as { processStatus: (status: Buffer) => void }).processStatus.bind(dev)
        const status = Buffer.alloc(68, 0xff)

        status[30] = 0
        processStatus(status)
        assert.equal(ha.devices[DEVICE_ID].properties.night_glare_mode, '비활성')
        status[30] = 2
        processStatus(status)
        assert.equal(ha.devices[DEVICE_ID].properties.night_glare_mode, '일출/일몰')
        status[30] = 3
        processStatus(status)
        assert.equal(ha.devices[DEVICE_ID].properties.night_glare_mode, '사용자')
    })

    test('writes the captured disabled and custom-schedule F010 commands', async () => {
        const { thinq, dev } = makeDevice()
        ;(dev as unknown as { now: () => number }).now = () => Date.parse('2026-08-14T00:00:00Z')

        dev.setProperty('night_glare_mode', '비활성')
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(hex(thinq.outbox[0]), 'AA16F0100200000000000000000000000000001EB5BB')

        thinq.resetRecorder()
        dev.setProperty('night_glare_mode', '사용자')
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(hex(thinq.outbox[0]), 'AA16F01002021A080E0C00001A080E150000001E36BB')
    })

    test('stores user times and encodes them in the next custom F010 command', async () => {
        const { ha, thinq, dev } = makeDevice()
        ;(dev as unknown as { now: () => number }).now = () => Date.parse('2026-08-14T00:00:00Z')
        assert.equal(ha.devices[DEVICE_ID].properties.night_glare_start, '21:00:00')
        assert.equal(ha.devices[DEVICE_ID].properties.night_glare_end, '06:00:00')
        assert.equal(ha.devices[DEVICE_ID].properties.night_glare_brightness, '30%')

        dev.setProperty('night_glare_start', '22:30')
        dev.setProperty('night_glare_end', '05:15:30')
        assert.deepEqual(ha.persistentDeviceStates[DEVICE_ID].refrigeratorNightGlare, {
            start: '22:30:00',
            end: '05:15:30',
            brightness: '30%',
        })
        assert.equal(thinq.outbox.length, 0)

        dev.setProperty('night_glare_mode', '사용자')
        await new Promise((resolve) => setImmediate(resolve))
        const body = thinq.outbox[0].subarray(2, -2)
        assert.equal(body.subarray(4, 10).toString('hex'), '1a080e0d1e00')
        assert.equal(body.subarray(10, 16).toString('hex'), '1a080e140f1e')
    })

    test('stores a selected night-glare brightness and writes it to F010', async () => {
        const { ha, thinq, dev } = makeDevice()
        ;(dev as unknown as { now: () => number }).now = () => Date.parse('2026-08-14T00:00:00Z')

        dev.setProperty('night_glare_brightness', '0%')
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(ha.devices[DEVICE_ID].properties.night_glare_brightness, '0%')
        assert.equal(thinq.outbox[0].subarray(2, -2).at(-1), 0)
        assert.equal(ha.persistentDeviceStates[DEVICE_ID].refrigeratorNightGlare.brightness, '0%')

        thinq.resetRecorder()
        dev.setProperty('night_glare_brightness', '80%')
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(thinq.outbox[0].subarray(2, -2).at(-1), 80)

        thinq.resetRecorder()
        dev.setProperty('night_glare_brightness', '25%')
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(thinq.outbox.length, 0)
        assert.equal(ha.devices[DEVICE_ID].properties.night_glare_brightness, '80%')
    })

    test('restores persisted user times and ignores invalid values', () => {
        const ha = new MockHAConnection()
        ha.persistentDeviceStates[DEVICE_ID] = {
            unrelated: { preserved: true },
            refrigeratorNightGlare: { start: '19:45:00', end: '07:10:00' },
        }
        const thinq = new MockThinq2Device(DEVICE_ID, META)
        const dev = new DUT(ha.asConnection(), thinq, META)
        assert.equal(ha.devices[DEVICE_ID].properties.night_glare_start, '19:45:00')
        assert.equal(ha.devices[DEVICE_ID].properties.night_glare_end, '07:10:00')

        dev.setProperty('night_glare_start', '25:00:00')
        assert.equal(ha.devices[DEVICE_ID].properties.night_glare_start, '19:45:00')
        assert.deepEqual(ha.persistentDeviceStates[DEVICE_ID].unrelated, { preserved: true })
    })

    test('uses Home Assistant sun.sun UTC times for the captured sunrise/sunset command', async () => {
        const { ha, thinq, dev } = makeDevice()
        ;(dev as unknown as { now: () => number }).now = () => Date.parse('2026-08-14T00:00:00Z')
        ha.homeAssistantStates['sun.sun'] = {
            state: 'above_horizon',
            attributes: {
                next_setting: '2026-08-14T10:47:17Z',
                next_rising: '2026-08-14T20:47:00Z',
            },
        }

        dev.setProperty('night_glare_mode', '일출/일몰')
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(hex(thinq.outbox[0]), 'AA16F01002011A080E0A2F111A080E142F00001E9BBB')
    })

    test('converts the custom schedule from the Home Assistant timezone to UTC', async () => {
        const { ha, thinq, dev } = makeDevice()
        ha.homeAssistantConfig.time_zone = 'America/New_York'
        ;(dev as unknown as { now: () => number }).now = () => Date.parse('2026-08-14T12:00:00Z')

        dev.setProperty('night_glare_mode', '사용자')
        await new Promise((resolve) => setImmediate(resolve))
        const body = thinq.outbox[0].subarray(2, -2)
        assert.equal(body.subarray(0, 4).toString('hex'), 'f0100202')
        assert.equal(body.subarray(4, 10).toString('hex'), '1a080e010000')
        assert.equal(body.subarray(10, 16).toString('hex'), '1a080e0a0000')
    })

    test('accepts the captured F010 success ACK without changing selector state', () => {
        const { ha, thinq } = makeDevice()
        thinq.emit('data', buf('AA081000100087BB'))
        assert.equal(ha.devices[DEVICE_ID].properties.night_glare_mode, undefined)
    })

    test('still ignores unrelated unsupported properties', () => {
        const { thinq, dev } = makeDevice()
        dev.setProperty('unsupported', 'ON')
        assert.equal(thinq.outbox.length, 0)
    })
})
