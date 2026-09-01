import type { DaemonDatabase } from '../store/database'

export type MobileDevice = {
  apnsEnvironment: 'production' | 'sandbox' | null
  apnsToken: string | null
  id: string
  lastSeenAt: number
  name: string
  pairedAt: number
  token: string
}

type MobileDeviceRow = {
  apnsEnvironment: 'production' | 'sandbox' | null
  apnsToken: string | null
  id: string
  lastSeenAt: number
  name: string
  pairedAt: number
  token: string
}

export class MobileDeviceStore {
  private readonly database: DaemonDatabase

  constructor(database: DaemonDatabase) {
    this.database = database
  }

  getOrCreateNamed(name: string): MobileDevice {
    const existing = this.findByName(name)
    if (existing) {
      return existing
    }
    return this.create(name)
  }

  getOrCreatePending(name: string, rotate: boolean): MobileDevice {
    const existing = this.findByName(name)
    if (!existing) {
      return this.create(name)
    }
    if (existing.lastSeenAt > 0) {
      return this.create(this.nextAvailableName(name))
    }
    if (!rotate) {
      return existing
    }
    const token = crypto.getRandomValues(new Uint8Array(24)).toHex()
    const pairedAt = Date.now()
    this.database.sqlite
      .query(
        `UPDATE mobile_device
         SET token = ?1, paired_at = ?2
         WHERE id = ?3`
      )
      .run(token, pairedAt, existing.id)
    return { ...existing, pairedAt, token }
  }

  listPaired(): MobileDevice[] {
    return this.database.sqlite
      .query<MobileDeviceRow, []>(
        `SELECT id, name, token, apns_token AS apnsToken,
                apns_environment AS apnsEnvironment,
                paired_at AS pairedAt, last_seen_at AS lastSeenAt
         FROM mobile_device
         WHERE last_seen_at > 0
         ORDER BY last_seen_at DESC`
      )
      .all()
      .map((row) => this.read(row))
      .filter((device): device is MobileDevice => device !== null)
  }

  remove(deviceId: string): boolean {
    return (
      this.database.sqlite.query('DELETE FROM mobile_device WHERE id = ?1').run(deviceId)
        .changes === 1
    )
  }

  validateToken(token: string): MobileDevice | null {
    return this.read(
      this.database.sqlite
        .query<MobileDeviceRow, [string]>(
          `SELECT id, name, token, apns_token AS apnsToken,
                  apns_environment AS apnsEnvironment,
                  paired_at AS pairedAt, last_seen_at AS lastSeenAt
           FROM mobile_device
           WHERE token = ?1`
        )
        .get(token)
    )
  }

  markSeen(deviceId: string): void {
    this.database.sqlite
      .query('UPDATE mobile_device SET last_seen_at = ?1 WHERE id = ?2')
      .run(Date.now(), deviceId)
  }

  registerPush(
    deviceId: string,
    registration: { environment: 'production' | 'sandbox'; token: string } | null
  ): boolean {
    const result = this.database.sqlite
      .query(
        `UPDATE mobile_device
         SET apns_token = ?1, apns_environment = ?2, push_updated_at = ?3
         WHERE id = ?4`
      )
      .run(registration?.token ?? null, registration?.environment ?? null, Date.now(), deviceId)
    return result.changes === 1
  }

  pushDevices(): MobileDevice[] {
    return this.database.sqlite
      .query<MobileDeviceRow, []>(
        `SELECT id, name, token, apns_token AS apnsToken,
                apns_environment AS apnsEnvironment,
                paired_at AS pairedAt, last_seen_at AS lastSeenAt
         FROM mobile_device
         WHERE apns_token IS NOT NULL AND apns_environment IS NOT NULL`
      )
      .all()
      .map((row) => this.read(row))
      .filter((device): device is MobileDevice => device !== null)
  }

  private findByName(name: string): MobileDevice | null {
    return this.read(
      this.database.sqlite
        .query<MobileDeviceRow, [string]>(
          `SELECT id, name, token, apns_token AS apnsToken,
                  apns_environment AS apnsEnvironment,
                  paired_at AS pairedAt, last_seen_at AS lastSeenAt
           FROM mobile_device
           WHERE name = ?1`
        )
        .get(name)
    )
  }

  private create(name: string): MobileDevice {
    const device: MobileDevice = {
      apnsEnvironment: null,
      apnsToken: null,
      id: crypto.randomUUID(),
      lastSeenAt: 0,
      name,
      pairedAt: Date.now(),
      token: crypto.getRandomValues(new Uint8Array(24)).toHex()
    }
    this.database.sqlite
      .query(
        `INSERT INTO mobile_device(id, name, token, paired_at, last_seen_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .run(device.id, device.name, device.token, device.pairedAt, device.lastSeenAt)
    return device
  }

  private nextAvailableName(baseName: string): string {
    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${baseName} (${suffix})`
      if (!this.findByName(candidate)) {
        return candidate
      }
    }
  }

  private read(row: MobileDeviceRow | null): MobileDevice | null {
    return row
      ? {
          apnsEnvironment: row.apnsEnvironment,
          apnsToken: row.apnsToken,
          id: row.id,
          lastSeenAt: row.lastSeenAt,
          name: row.name,
          pairedAt: row.pairedAt,
          token: row.token
        }
      : null
  }
}
