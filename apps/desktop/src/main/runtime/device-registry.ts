// Why: per-device tokens replace the shared runtime auth token for WebSocket
// (mobile) connections. Each paired device gets its own revocable token so
// compromising one device doesn't expose others. The registry is a simple
// JSON file with hardened permissions matching the runtime metadata pattern.
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { hardenExistingSecureFile, writeSecureJsonFile } from '~shared/secure-file'

import { DEVICE_REGISTRY_FILENAME } from './mobile-pairing-files'
import { isRpcAccessTier, type RpcAccessTier } from './rpc/access'

type DeviceEntryBase = {
  deviceId: string
  name: string
  token: string
  pairedAt: number
  lastSeenAt: number
}

// Why: a Coworking-issued host grant is a different object from a paired phone
// or CLI — it carries the tailnet identity it was issued to, the execution host
// it is bounded to, and its own expiry/revocation. Modelled as a discriminated
// union rather than optional fields so every consumer must handle the new case.
export type CoworkingHostDeviceEntry = DeviceEntryBase & {
  scope: 'coworking-host'
  subject: { nodeId: string; userDisplayName: string }
  hostScopeKey: string
  // Why: without a tier the grant cannot express read-only vs control vs full
  // host authority, and every issued grant would collapse to the same power.
  tier: RpcAccessTier
  expiresAt: number | null
  revokedAt: number | null
}

export type MobileDeviceEntry = DeviceEntryBase & { scope: 'mobile' }
export type RuntimeDeviceEntry = DeviceEntryBase & { scope: 'runtime' }

export type DeviceEntry = MobileDeviceEntry | RuntimeDeviceEntry | CoworkingHostDeviceEntry

type StoredDeviceEntry = DeviceEntryBase & {
  scope?: unknown
  subject?: { nodeId?: unknown; userDisplayName?: unknown }
  hostScopeKey?: unknown
  tier?: unknown
  expiresAt?: unknown
  revokedAt?: unknown
  relayBinding?: unknown
  mobilePairingConnectionMode?: unknown
}

const LEGACY_RELAY_REVOKE_OUTBOX_FILENAME = 'mobile-relay-revoke-outbox.json'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Read one persisted entry, dropping anything malformed.
 *
 * Why: a Coworking host grant must never fall through to the legacy mobile
 * default — that would hand a broken host grant the phone-pairing powers
 * instead of discarding it. Returned as an array so `load` can drop entries.
 */
function readStoredDeviceEntry(device: StoredDeviceEntry): DeviceEntry[] {
  const base = {
    deviceId: device.deviceId,
    name: device.name,
    token: device.token,
    pairedAt: device.pairedAt,
    lastSeenAt: device.lastSeenAt
  }
  if (device.scope === 'coworking-host') {
    if (
      !isNonEmptyString(device.hostScopeKey) ||
      !isNonEmptyString(device.subject?.nodeId) ||
      !isNonEmptyString(device.subject?.userDisplayName)
    ) {
      return []
    }
    return [
      {
        ...base,
        scope: 'coworking-host',
        subject: {
          nodeId: device.subject.nodeId,
          userDisplayName: device.subject.userDisplayName
        },
        hostScopeKey: device.hostScopeKey,
        // Why: an unrecognised persisted tier falls back to the least power
        // rather than the most — a corrupted record must not escalate.
        tier: isRpcAccessTier(device.tier) ? device.tier : 'read',
        expiresAt: typeof device.expiresAt === 'number' ? device.expiresAt : null,
        revokedAt: typeof device.revokedAt === 'number' ? device.revokedAt : null
      }
    ]
  }
  // Why: runtime-scoped tokens came from the removed direct server pairing
  // flow. Dropping them on load revokes that access while preserving phones
  // and Coworking grants.
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

  // Why: the Coworking consent moment issues the credential over the already
  // authenticated tailnet channel, so there is no out-of-band leak window and
  // no pending-token rotation dance like the mobile QR path needs.
  addCoworkingHostDevice(args: {
    name: string
    subject: { nodeId: string; userDisplayName: string }
    hostScopeKey: string
    tier: RpcAccessTier
    expiresAt: number | null
  }): CoworkingHostDeviceEntry {
    const entry: CoworkingHostDeviceEntry = {
      deviceId: randomUUID(),
      name: args.name,
      token: randomBytes(24).toString('hex'),
      scope: 'coworking-host',
      pairedAt: Date.now(),
      lastSeenAt: 0,
      subject: args.subject,
      hostScopeKey: args.hostScopeKey,
      tier: args.tier,
      expiresAt: args.expiresAt,
      revokedAt: null
    }
    this.devices.push(entry)
    this.save()
    return entry
  }

  // Why: revoking marks rather than deletes so the owner keeps an audit trail of
  // what was granted and when it was withdrawn. validateToken enforces it.
  revokeDevice(deviceId: string, now = Date.now()): boolean {
    const device = this.devices.find((d) => d.deviceId === deviceId)
    if (!device || device.scope !== 'coworking-host' || device.revokedAt !== null) {
      return false
    }
    device.revokedAt = now
    this.save()
    return true
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

  validateToken(token: string, now = Date.now()): DeviceEntry | null {
    const device = this.devices.find((d) => d.token === token)
    if (!device) {
      return null
    }
    // Why: expiry and revocation are enforced here rather than at each call site,
    // so a withdrawn grant cannot survive by reaching a transport that forgot to
    // re-check. Mobile devices carry neither field and are unaffected.
    if (device.scope === 'coworking-host') {
      if (device.revokedAt !== null) {
        return null
      }
      if (device.expiresAt !== null && device.expiresAt <= now) {
        return null
      }
    }
    return device
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
          // Keep valid mobile and Coworking access usable in memory; the stale
          // entries trigger another best-effort rewrite on the next startup.
        }
      }
    } catch {
      this.devices = []
    }
  }

  private save(): void {
    // Why: runtime credentials are process-bound and must not survive a crash
    // or restart; mobile devices and Coworking grants remain durable.
    writeSecureJsonFile(
      this.registryPath,
      this.devices.filter((device) => device.scope !== 'runtime')
    )
  }
}
