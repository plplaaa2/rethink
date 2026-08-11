import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import DUT from '@/cloud/devices/RAC_056905_WW'
import type { Metadata } from '@/cloud/thinq'
import { MockHAConnection, MockThinq2Device, buf, hex } from '@/tests/helpers/mocks'
import { enableMockTimers, tickMockTimers } from '@/tests/helpers/timers'

const DEVICE_ID = 'test-id'
const MODEL_ID = 'RAC_056905_WW'
const META: Metadata = { modelId: MODEL_ID, modelName: 'TEST', swVersion: '1.0' }

// Real packet captures from a RAC_056905_WW air conditioner.

// Capability request
const CAPS_REQUEST_HEX = '01010400000065020201027D416A0D'

// Capability response (response to query 0x1F5/1). Contains TLV t=0x2DA (eeprom checksum),
// which triggers `isCapsResponse`
const CAPS_RESPONSE_HEX =
    '0000040000008702010249' +
    'B001B05057B0A0017CB0C1B103B306B34FB4C7B582B541B543B6A04D81B6F0690409B701BC40BD47' +
    'B5C0B61024B643B5C1B600B643B5C2B600B643B5C4B61026B643B5C6B6102CB643' +
    '44E1'

// Comprehensive state response (response to query 0x1F5/2).
// Contains TLV t=0x1f7 (power), which triggers `isValuesResponse`
//      t=0x1f9 l=0 v=0x4 (4)   mode=heat
//      t=0x1f7 l=0 v=0x1 (1)   power=ON
//      t=0x1fa l=0 v=0x3 (3)   fan=low
//      t=0x1fd l=1 v=0x29 (41) current_temp=20.5
//      t=0x1fe l=1 v=0x26 (38) set_temp=19
//      ...
const QUERY_RESPONSE_HEX =
    '00000400000087020415' +
    '777E447DC17E837F50297F9026C840C880C8C08340838083C0868086C0870087C0894088408A1011' +
    '8A505A8A8F8CA0C0BA8CD010ACE00164D540D580C900CAD0A0CB1040CB40CB8CCBCFCC1032CC504F' +
    'CC90438B40BF600155BFE00271BFA00155C0200271BE509FBE90A01B01BED050C300C340C0C0C380' +
    '3E6B'

// Real state response from an IDU that reports raw 0/1 sentinels for unsupported pipe sensors.
const QUERY_RESPONSE_UNSUPPORTED_PIPE_TEMPS_HEX =
    '000004000000870204F77D7E407DC17E887F50367F9036C85064C880C8C08340838083C0868086C0870087C08F80894088408A10108A50598A8A8CA003B28CD027ACE00111CA00D540D580C900CAD07ECB10A2CB40CB9012CBCACC103CCC5067CC909C8B40BF600182BFC0BFA001F4C000BE41BE811B01BED064C340C0C0C380CCC0CD00CD40900017D4'

// Bytes that the device sends in response to specific HA setProperty calls.
const WRITE_MODE_FAN_ONLY_HEX = '01010400000065020101067E427E837F80B452'
const WRITE_MODE_HEAT_HEX = '01010400000065020101077E447E837F902AF936'
const WRITE_POWER_OFF_HEX = '01010400000065020101027DC00576'
const WRITE_INDIRECT_WIND_ON_HEX = '0101040000006502010102C8416527'
const WRITE_INDIRECT_WIND_OFF_HEX = '0101040000006502010102C84615C0'
const STATE_INDIRECT_WIND_ON_HEX = '0000040000008702040106C841BF60031CAFC7'
const STATE_INDIRECT_WIND_OFF_HEX = '0000040000008702046A09C846CC5056BF6001C78E4D'
const WRITE_AUTO_DRY_ON_HEX = '010104000000650201010283816D5D'
const WRITE_AUTO_DRY_OFF_HEX = '010104000000650201010283807D7C'
const STATE_AUTO_DRY_ON_HEX = '000004000000870204FE0283817DA9'
const STATE_AUTO_DRY_OFF_HEX = '0000040000008702045502838099E1'

function makeDevice() {
    const ha = new MockHAConnection()
    const thinq = new MockThinq2Device(DEVICE_ID, META)
    const dev = new DUT(ha.asConnection(), thinq, META)
    ha.on('setProperty', (id: string, prop: string, value: string) => {
        dev.setProperty(prop, value)
    })
    return { ha, thinq, dev }
}

/** Bring the device through the full caps->values->initMakeSetConfig flow using mock timers.
 *  Returns the device with config installed and thinq recorder cleared. */
function buildReadyDevice(t: import('node:test').TestContext) {
    enableMockTimers(t)
    const { ha, thinq, dev } = makeDevice()

    // Constructor sent the queryCaps packet, discard it.
    thinq.resetRecorder()

    // Respond & give other timeouts a chance to fire.
    thinq.emit('data', buf(CAPS_RESPONSE_HEX))
    thinq.emit('data', buf(QUERY_RESPONSE_HEX))
    tickMockTimers(t, 6000)

    thinq.resetRecorder()
    return { ha, thinq, dev }
}

describe(MODEL_ID, () => {
    test('caps and values responses triggers config publish', (t) => {
        enableMockTimers(t)
        const { ha, thinq, dev } = makeDevice()
        thinq.resetRecorder() // discard the queryCaps from the constructor

        thinq.emit('data', buf(CAPS_RESPONSE_HEX))
        thinq.emit('data', buf(QUERY_RESPONSE_HEX))

        // allow timed events to process
        tickMockTimers(t, 6000)
        const device = ha.devices[DEVICE_ID]
        assert.ok(device, 'HA configuration published')

        // Config exposes the climate component with all five base fields registered.
        const components = device.config!.components as Record<string, Record<string, unknown>>
        assert.ok(components.climate, 'climate component')
        assert.equal(components.climate.platform, 'climate')
        assert.equal(components.climate.temp_step, 1, 'target temperature changes in whole degrees')
        assert.ok(components.indirectwind, 'indirect wind switch')
        assert.equal(components.indirectwind.platform, 'switch')
        assert.equal(components.indirectwind.optimistic, undefined, 'switch uses reported device state')

        // Capability bits from the captured caps response unlocked these optional components.
        assert.ok(components.jet, 'jet (because 0x2CD bits 0x1|0x2)')
        assert.ok(components.energysave, 'energysave (because 0x2CC bit 0x2)')
        assert.ok(components.autodry, 'autodry (because 0x2CC bit 0x4)')
        assert.equal(components.autodry.platform, 'switch')
        assert.equal(components.autodry.optimistic, undefined, 'switch uses reported device state')
        assert.ok(components.sleeptimer, 'sleeptimer (because 0x2D3 bit 0x1)')
        assert.ok(components.starttimer, 'starttimer (because 0x2D3 bit 0x4)')
        assert.ok(components.stoptimer, 'stoptimer (because 0x2D3 bit 0x4)')
        // Conversely, airclean (0x2CC bit 0x1) is not unlocked.
        assert.ok(!components.airclean, 'airclean off (0x2CC bit 0x1 unset)')

        // Swing modes registered because 0x2CD has both 0x4 and 0x8.
        assert.deepEqual(components.climate.swing_modes, ['1', '2', '3', '4', '5', '6', 'on', 'off'])
        assert.deepEqual(components.climate.swing_horizontal_modes, [
            '1',
            '2',
            '3',
            '4',
            '5',
            '1-3',
            '3-5',
            'on',
            'off',
        ])

        dev.drop()
    })

    test('unsupported pipe temperature sentinels are omitted from discovery', (t) => {
        enableMockTimers(t)
        const { ha, thinq, dev } = makeDevice()
        thinq.resetRecorder()

        thinq.emit('data', buf(CAPS_RESPONSE_HEX))
        thinq.emit('data', buf(QUERY_RESPONSE_UNSUPPORTED_PIPE_TEMPS_HEX))
        tickMockTimers(t, 6000)

        const components = ha.devices[DEVICE_ID].config!.components as Record<string, Record<string, unknown>>
        assert.ok(!components.pipeintemp, 'unsupported liquid pipe temperature omitted')
        assert.ok(!components.pipeouttemp, 'unsupported gas pipe temperature omitted')
        assert.ok(components.oduhextemp, 'valid ODU heat exchanger temperature retained')
        assert.ok(components.oduairtemp, 'valid ODU air temperature retained')

        dev.drop()
    })

    test('initial state response publishes all expected HA properties', (t) => {
        const { ha, thinq, dev } = buildReadyDevice(t)

        thinq.emit('data', buf(QUERY_RESPONSE_HEX))

        // allow timed events to process
        tickMockTimers(t, 1000)

        assert.equal(ha.getProperty(DEVICE_ID, 'climate', 'current_temperature'), 20.5) // 0x29 / 2
        assert.equal(ha.getProperty(DEVICE_ID, 'climate', 'temperature_state'), 19) // 0x26 / 2
        assert.equal(ha.getProperty(DEVICE_ID, 'climate', 'fan_mode_state'), 'low') // 0x1FA=3
        assert.equal(ha.getProperty(DEVICE_ID, 'climate', 'mode_state'), 'heat') // 0x1F9=4 with power=ON
        assert.equal(ha.getProperty(DEVICE_ID, 'climate', 'swing_mode_state'), 'off') // 0x321=0
        assert.equal(ha.getProperty(DEVICE_ID, 'climate', 'swing_horizontal_mode_state'), 'off') // 0x322=0
        assert.equal(ha.getProperty(DEVICE_ID, 'autodry', 'state'), 'OFF') // 0x20E=0
        assert.equal(ha.getProperty(DEVICE_ID, 'sleeptimer', 'state'), 0) // 0x21A=0
        assert.equal(ha.getProperty(DEVICE_ID, 'starttimer', 'state'), 0) // 0x21C=0
        assert.equal(ha.getProperty(DEVICE_ID, 'stoptimer', 'state'), 0) // 0x21B=0
        assert.equal(ha.getProperty(DEVICE_ID, 'jet', 'state'), 'OFF')

        // energysave is mode-dependent (cool only). With mode=heat its read_callback returns false,
        // so it must NOT have been published.
        assert.ok(!ha.getProperty(DEVICE_ID, 'energysave', 'state'), 'energysave suppressed in heat mode')

        dev.drop()
    })

    test('HA write climate-mode=fan_only emits expected bytes', (t) => {
        const { thinq, dev, ha } = buildReadyDevice(t)
        // Pre-state observed in the capture at the moment of this write.
        dev.raw_clip_state[0x1fa] = 3
        dev.raw_clip_state[0x1fe] = 0

        ha.setProperty(DEVICE_ID, 'climate', 'mode_command', 'fan_only')

        assert.equal(thinq.outbox.length, 1)
        assert.equal(hex(thinq.outbox[0]), WRITE_MODE_FAN_ONLY_HEX.toUpperCase())

        dev.drop()
    })

    test('HA target temperature is rounded to a whole degree', (t) => {
        const { thinq, dev, ha } = buildReadyDevice(t)

        ha.setProperty(DEVICE_ID, 'climate', 'temperature_command', '20.5')

        assert.equal(thinq.outbox.length, 1)
        assert.equal(dev.raw_clip_state[0x1fe], 42, '20.5 C command rounded to 21 C protocol value')

        dev.drop()
    })

    test('indirect wind switch maps ON/OFF commands and reported states', (t) => {
        const { thinq, dev, ha } = buildReadyDevice(t)

        ha.setProperty(DEVICE_ID, 'indirectwind', 'command', 'ON')
        assert.equal(hex(thinq.outbox[0]), WRITE_INDIRECT_WIND_ON_HEX)

        thinq.emit('data', buf(STATE_INDIRECT_WIND_ON_HEX))
        assert.equal(ha.getProperty(DEVICE_ID, 'indirectwind', 'state'), 'ON')

        thinq.resetRecorder()
        ha.setProperty(DEVICE_ID, 'indirectwind', 'command', 'OFF')
        assert.equal(hex(thinq.outbox[0]), WRITE_INDIRECT_WIND_OFF_HEX)

        thinq.emit('data', buf(STATE_INDIRECT_WIND_OFF_HEX))
        assert.equal(ha.getProperty(DEVICE_ID, 'indirectwind', 'state'), 'OFF')

        dev.drop()
    })

    test('auto dry switch maps ON/OFF commands and reported states', (t) => {
        const { thinq, dev, ha } = buildReadyDevice(t)

        ha.setProperty(DEVICE_ID, 'autodry', 'command', 'ON')
        assert.equal(hex(thinq.outbox[0]), WRITE_AUTO_DRY_ON_HEX)

        thinq.emit('data', buf(STATE_AUTO_DRY_ON_HEX))
        assert.equal(ha.getProperty(DEVICE_ID, 'autodry', 'state'), 'ON')

        thinq.resetRecorder()
        ha.setProperty(DEVICE_ID, 'autodry', 'command', 'OFF')
        assert.equal(hex(thinq.outbox[0]), WRITE_AUTO_DRY_OFF_HEX)

        thinq.emit('data', buf(STATE_AUTO_DRY_OFF_HEX))
        assert.equal(ha.getProperty(DEVICE_ID, 'autodry', 'state'), 'OFF')

        dev.drop()
    })

    test('HA write climate-mode=heat emits expected bytes', (t) => {
        const { thinq, dev, ha } = buildReadyDevice(t)
        // Pre-state observed in the capture at the moment of this write.
        dev.raw_clip_state[0x1fa] = 3
        dev.raw_clip_state[0x1fe] = 42 // 21C

        ha.setProperty(DEVICE_ID, 'climate', 'mode_command', 'heat')

        assert.equal(thinq.outbox.length, 1)
        assert.equal(hex(thinq.outbox[0]), WRITE_MODE_HEAT_HEX.toUpperCase())

        dev.drop()
    })

    test('HA write climate-mode=off triggers power=OFF instead of mode write', (t) => {
        const { thinq, dev, ha } = buildReadyDevice(t)
        dev.raw_clip_state[0x1f7] = 1
        dev.raw_clip_state[0x1f9] = 0
        dev.raw_clip_state[0x1fa] = 3
        dev.raw_clip_state[0x1fe] = 42

        ha.setProperty(DEVICE_ID, 'climate', 'mode_command', 'off')

        assert.equal(thinq.outbox.length, 1)
        assert.equal(hex(thinq.outbox[0]), WRITE_POWER_OFF_HEX.toUpperCase())

        dev.drop()
    })

    test('constructor sends a queryCaps packet on the wire', () => {
        const { thinq, dev } = makeDevice()
        if (dev.query_caps_timeout) {
            clearInterval(dev.query_caps_timeout)
            dev.query_caps_timeout = undefined
        }
        assert.equal(thinq.outbox.length, 1)
        assert.equal(hex(thinq.outbox[0]), CAPS_REQUEST_HEX.toUpperCase())
        dev.drop()
    })
})
