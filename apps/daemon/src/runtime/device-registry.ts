// Why: per-device tokens replace the shared runtime auth token for WebSocket
// (mobile) connections. Each paired device gets its own revocable token so
// compromising one device doesn't expose others. The registry is a simple
// JSON file with hardened permissions matching the runtime metadata pattern.
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { hardenExistingSecureFile, writeSecureJsonFile } from '~main/secure-file'

import { DEVICE_REGISTRY_FILENAME } from './mobile-pairing-files'

type DeviceEntryBase = {
  deviceId: string
  name: string
  token: string
  pairedAt: number
  lastSeenAt: number
}

export type MobileDeviceEntry = DeviceEntryBase & { scope: 'mobile' }
export type RuntimeDeviceEntry = DeviceEntryBase & { scope: 'runtime' }

export type DeviceEntry = MobileDeviceEntry | RuntimeDeviceEntry

type StoredDeviceEntry = DeviceEntryBase & {
  scope?: unknown
  relayBinding?: unknown
  mobilePairingConnectionMode?: unknown
}

const LEGACY_RELAY_REVOKE_OUTBOX_FILENAME = 'mobile-relay-revoke-outbox.json'

/**
 * Read one persisted entry, dropping anything malformed.
 */
function readStoredDeviceEntry(device: StoredDeviceEntry): DeviceEntry[] {
  const base = {
    deviceId: device.deviceId,
    name: device.name,
    token: device.token,
    pairedAt: device.pairedAt,
    lastSeenAt: device.lastSeenAt
  }
  // Why: runtime-scoped tokens came from the removed direct server pairing
  // flow. Dropping them on load revokes that access while preserving phones.
  if (device.scope === 'runtime') {
    return []
  }
  // Why: older registries only existed for phone pairing. Treat missing
  // scope as mobile so legacy device tokens do not gain new CLI powers.
  return device.scope === undefined || device.scope === 'mobile'
    ? [{ ...base, scope: 'mobile' }]
    : []
}

export class DeviceRegistry {
  private readonly registryPath: string
  private devices: DeviceEntry[] = []

  constructor(userDataPath: string) {
    this.registryPath = join(userDataPath, DEVICE_REGISTRY_FILENAME)
    this.load()
    try {
      // Why: Cloud Relay was removed and the outbox contains identifiers that
      // can no longer be delivered or cleared through the deleted service.
      rmSync(join(userDataPath, LEGACY_RELAY_REVOKE_OUTBOX_FILENAME), { force: true })
    } catch {
      // Retry on the next runtime startup without breaking direct pairing.
    }
  }

  addDevice(name: string): MobileDeviceEntry {
    const entry: MobileDeviceEntry = {
      deviceId: randomUUID(),
      name,
      token: randomBytes(24).toString('hex'),
      scope: 'mobile',
      pairedAt: Date.now(),
      lastSeenAt: 0
    }
    this.devices.push(entry)
    this.save()
    return entry
  }

  addRuntimeDevice(name: string): RuntimeDeviceEntry {
    const entry: RuntimeDeviceEntry = {
      deviceId: randomUUID(),
      name,
      token: randomBytes(24).toString('hex'),
      scope: 'runtime',
      pairedAt: Date.now(),
      lastSeenAt: 0
    }
    // Why: runtime web credentials live only for the host process. The secure
    // pairing file is their sole handoff, and shutdown explicitly revokes them.
    this.devices.push(entry)
    return entry
  }

  // Why: coalesce repeated QR-regenerate clicks onto a single pending token.
  // Each call to addDevice() produces a valid auth credential; without
  // coalescing, every renderer call to `mobile.getPairingQR` (e.g. the new
  // copy-button flow that encourages regeneration) leaves an orphaned token
  // forever. Returns an existing never-scanned entry if present; otherwise
  // mints a new one and drops any stale pending entries.
  getOrCreatePendingDevice(name: string): MobileDeviceEntry {
    const existing = this.devices.find(
      (device): device is MobileDeviceEntry => device.lastSeenAt === 0 && device.scope === 'mobile'
    )
    if (existing) {
      return existing
    }
    return this.addDevice(name)
  }

  // Why: local development reopens the same simulator on every `pnpm dev`.
  // Reusing its named credential prevents one paired-device row per restart.
  getOrCreateNamedDevice(name: string): MobileDeviceEntry {
    return (
      this.devices.find(
        (device): device is MobileDeviceEntry => device.name === name && device.scope === 'mobile'
      ) ?? this.addDevice(name)
    )
  }

  // Why: explicit rotation path for "Regenerate QR" — invalidates any
  // existing never-scanned token (e.g. one that was screenshotted, copied
  // to clipboard, or shown on a screen-share) and mints a fresh one. Without
  // this, getOrCreatePendingDevice keeps returning the same token forever
  // until a phone actually pairs, so users have no way to revoke a leaked
  // pre-pairing token.
  rotatePendingDevice(name: string): MobileDeviceEntry {
    this.devices = this.devices.filter(
      (device) => device.lastSeenAt !== 0 || device.scope !== 'mobile'
    )
    return this.addDevice(name)
  }

  removeDevice(deviceId: string): boolean {
    const before = this.devices.length
    this.devices = this.devices.filter((d) => d.deviceId !== deviceId)
    if (this.devices.length < before) {
      this.save()
      return true
    }
    return false
  }

  getDevice(deviceId: string): DeviceEntry | null {
    return this.devices.find((d) => d.deviceId === deviceId) ?? null
  }

  listDevices(): readonly DeviceEntry[] {
    return this.devices
  }

  validateToken(token: string): DeviceEntry | null {
    return this.devices.find((device) => device.token === token) ?? null
  }

  updateLastSeen(deviceId: string): void {
    const device = this.devices.find((d) => d.deviceId === deviceId)
    if (device) {
      device.lastSeenAt = Date.now()
      this.save()
    }
  }

  private load(): void {
    if (!existsSync(this.registryPath)) {
      this.devices = []
      return
    }
    try {
      hardenExistingSecureFile(this.registryPath)
      const parsed = JSON.parse(readFileSync(this.registryPath, 'utf-8')) as StoredDeviceEntry[]
      const removedLegacyRelayFields = parsed.some(
        (device) =>
          Object.hasOwn(device, 'relayBinding') ||
          Object.hasOwn(device, 'mobilePairingConnectionMode')
      )
      this.devices = parsed.flatMap((device) => readStoredDeviceEntry(device))
      if (removedLegacyRelayFields || this.devices.length !== parsed.length) {
        try {
          this.save()
        } catch {
          // Keep valid mobile access usable in memory; stale entries trigger
          // another best-effort rewrite on the next startup.
        }
      }
    } catch {
      this.devices = []
    }
  }

  private save(): void {
    // Why: runtime credentials are process-bound and must not survive a crash
    // or restart; mobile devices remain durable.
    writeSecureJsonFile(
      this.registryPath,
      this.devices.filter((device) => device.scope !== 'runtime')
    )
  }
}
