/* Verifies confirmed AIR_910604_WW controls and MFilter response parsing.
 * Related files: cloud/devices/AIR_910604_WW.ts, cloud/ha_bridge.ts. */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import DUT from '@/cloud/devices/AIR_910604_WW'
import type { Metadata } from '@/cloud/thinq'
import { MockHAConnection, MockThinq1Device } from '@/tests/helpers/mocks'

const DEVICE_ID = 'test-air-purifier'
const MODEL_ID = 'AIR_910604_WW'
const META: Metadata = { modelId: MODEL_ID, modelName: MODEL_ID, swVersion: '2.6.7_RTOS_3K' }

function makeDevice() {
    const ha = new MockHAConnection()
    const thinq = new MockThinq1Device(DEVICE_ID, META)
    const dev = new DUT(ha.asConnection(), thinq, META)
    return { ha, thinq, dev }
}

describe(MODEL_ID, () => {
    test('config exposes only confirmed controls and filter sensors', () => {
        const { ha } = makeDevice()
        const components = ha.devices[DEVICE_ID].config!.components as Record<string, Record<string, unknown>>
        assert.deepEqual(Object.keys(components), [
            'power',
            'air_fast',
            'air_removal',
            'sleep_timer',
            'filter_remaining_time',
            'filter_remaining',
        ])
        assert.deepEqual(components.sleep_timer.options, ['Off', '2 hours', '4 hours', '8 hours', '12 hours'])
        assert.equal(components.power.state_topic, undefined)
    })

    test('start requests MFilter status', () => {
        const { thinq, dev } = makeDevice()
        dev.start()
        assert.deepEqual(thinq.sent, [{ Cmd: 'Config', CmdOpt: 'Get', Value: 'MFilter', Data: 'bnVsbA==' }])
    })

    test('power commands use confirmed Operation values', () => {
        const { thinq, dev } = makeDevice()
        dev.setProperty('power', 'OFF')
        dev.setProperty('power', 'ON')
        assert.deepEqual(thinq.sent, [
            { Cmd: 'Control', CmdOpt: 'Operation', Value: '0' },
            { Cmd: 'Control', CmdOpt: 'Operation', Value: '1' },
        ])
    })

    test('fast and sterilization switches use confirmed Set values', () => {
        const { thinq, dev } = makeDevice()
        dev.setProperty('air_fast', 'ON')
        dev.setProperty('air_fast', 'OFF')
        dev.setProperty('air_removal', 'ON')
        dev.setProperty('air_removal', 'OFF')
        assert.deepEqual(thinq.sent, [
            { Cmd: 'Control', CmdOpt: 'Set', Value: { AirFast: '1' } },
            { Cmd: 'Control', CmdOpt: 'Set', Value: { AirFast: '0' } },
            { Cmd: 'Control', CmdOpt: 'Set', Value: { AirRemoval: '1' } },
            { Cmd: 'Control', CmdOpt: 'Set', Value: { AirRemoval: '0' } },
        ])
    })

    test('sleep timer accepts only confirmed choices', () => {
        const { thinq, dev } = makeDevice()
        for (const option of ['Off', '2 hours', '4 hours', '8 hours', '12 hours', 'invalid']) {
            dev.setProperty('sleep_timer', option)
        }
        assert.deepEqual(
            thinq.sent.map((packet) => (packet as { Value: { SleepTime: string } }).Value.SleepTime),
            ['0', '120', '240', '480', '720'],
        )
    })

    test('MFilter response publishes remaining hours and percentage', () => {
        const { ha, thinq } = makeDevice()
        thinq.emit('data', Buffer.from('{"RemainTime":"2843","ChangePeriod":"4000"}'))
        assert.equal(ha.devices[DEVICE_ID].properties.filter_remaining_time, 2843)
        assert.equal(ha.devices[DEVICE_ID].properties.filter_remaining, 71.1)
    })

    test('invalid and unrelated data are ignored', () => {
        const { ha, thinq } = makeDevice()
        thinq.emit('data', Buffer.from('TimeZone=+0900,GroupType=12'))
        thinq.emit('data', Buffer.from('{"RemainTime":"x","ChangePeriod":"4000"}'))
        thinq.emit('data', Buffer.from('{"RemainTime":"100","ChangePeriod":"0"}'))
        assert.deepEqual(ha.devices[DEVICE_ID].properties, {})
    })
})
