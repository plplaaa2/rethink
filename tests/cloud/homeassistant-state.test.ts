import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Connection } from '@/cloud/homeassistant'
import type { HAConfig } from '@/util/config'

// Persistent derived-device state coverage.
// Related files: cloud/homeassistant.ts, cloud/devices/RAC_056905_WW.ts.
test('Home Assistant device state uses an atomic hashed per-device JSON file', () => {
    const storagePath = mkdtempSync(join(tmpdir(), 'rethink-ha-state-'))
    const config = { storage_path: storagePath } as HAConfig
    const connection = Object.create(Connection.prototype) as Connection
    Object.defineProperty(connection, 'config', { value: config })

    try {
        connection.setPersistentDeviceState('device/with unsafe chars', {
            racEnergy: { totalWh: 1234, lastOperationWh: 234 },
        })
        assert.deepEqual(connection.getPersistentDeviceState('device/with unsafe chars'), {
            racEnergy: { totalWh: 1234, lastOperationWh: 234 },
        })

        const files = readdirSync(storagePath)
        assert.equal(files.length, 1)
        assert.match(files[0], /^device_[0-9a-f]{64}\.json$/)
        assert.ok(!files[0].includes('unsafe'))

        connection.setPersistentDeviceState('device/with unsafe chars', {
            racEnergy: { totalWh: 1500, lastOperationWh: 500 },
        })
        assert.deepEqual(connection.getPersistentDeviceState('device/with unsafe chars'), {
            racEnergy: { totalWh: 1500, lastOperationWh: 500 },
        })
        assert.equal(readdirSync(storagePath).filter((file) => file.endsWith('.tmp')).length, 0)
    } finally {
        rmSync(storagePath, { recursive: true, force: true })
    }
})
