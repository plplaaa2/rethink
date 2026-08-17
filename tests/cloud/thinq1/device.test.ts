import assert from 'node:assert/strict'
import { once } from 'node:events'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { TypedEmitter } from 'tiny-typed-emitter'
import { Device, DeviceAcceptor } from '@/cloud/thinq1/device'
import { make } from '@/util/length_prefixed_frame'

type MockConnectionEvents = {
    status: (buffer: Buffer) => void
    response: (body: Record<string, unknown>) => void
    close: () => void
    error: (error: Error) => void
}

class MockConnection extends TypedEmitter<MockConnectionEvents> {
    deviceObj?: Device
    sent: unknown[] = []

    json(value: unknown) {
        this.sent.push(value)
    }
}

test('parallel connections share one device without duplicating outbound commands', () => {
    const first = new MockConnection()
    const second = new MockConnection()
    const device = new Device(first as never, 'device-id', {
        deviceType: '401',
        modelId: 'AIR_910604_WW',
        modelName: 'AIR_910604_WW',
    })
    const reports: Buffer[] = []
    const responses: Record<string, unknown>[] = []
    let closes = 0
    device.on('data', (packet) => reports.push(packet))
    device.on('response', (body) => responses.push(body))
    device.on('close', () => closes++)

    device.addConnection(second as never)
    first.emit('status', Buffer.from('first'))
    second.emit('status', Buffer.from('second'))
    second.emit('response', { ReturnCode: '0000' })
    device.send({ Cmd: 'Control' })

    assert.deepEqual(
        reports.map((packet) => packet.toString()),
        ['first', 'second'],
    )
    assert.equal(first.sent.length, 0)
    assert.equal(second.sent.length, 1)
    assert.deepEqual(responses, [{ ReturnCode: '0000' }])

    second.emit('close')
    assert.equal(closes, 0)

    device.send({ Cmd: 'Fallback' })
    assert.equal(first.sent.length, 1)

    first.emit('close')
    assert.equal(closes, 1)
})

test('acceptor keeps parallel sockets for one device instead of reconnecting them', async () => {
    const acceptor = new DeviceAcceptor(() => ({
        deviceType: '401',
        modelId: 'AIR_910604_WW',
        modelName: 'AIR_910604_WW',
    }))
    const first = new PassThrough()
    const second = new PassThrough()
    let newDevices = 0
    let droppedDevices = 0
    let responseCode: unknown
    acceptor.on('newDevice', (device) => {
        newDevices++
        device.on('response', (body) => (responseCode = body.ReturnCode))
    })
    acceptor.on('dropDevice', () => droppedDevices++)

    const alive = make(
        JSON.stringify({
            Header: { 'x-lgedm-deviceId': 'device-id' },
            Body: { CmdWId: 'alive', Cmd: 'Alive' },
        }),
    )
    acceptor.accept(first)
    first.write(alive)
    first.write(
        make(
            JSON.stringify({
                Header: { 'x-lgedm-deviceId': 'device-id' },
                Body: { CmdWId: 'button-change', ReturnCode: '0000' },
            }),
        ),
    )
    acceptor.accept(second)
    second.write(alive)

    assert.equal(newDevices, 1)
    assert.equal(responseCode, '0000')
    assert.equal(first.destroyed, false)
    assert.equal(second.destroyed, false)

    const firstClosed = once(first, 'close')
    first.destroy()
    await firstClosed
    assert.equal(droppedDevices, 0)

    const secondClosed = once(second, 'close')
    second.destroy()
    await secondClosed
    assert.equal(droppedDevices, 1)
})
