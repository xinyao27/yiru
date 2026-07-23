import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { getDefaultPersistedState } from '../../shared/constants'
import { DurableStateFile } from './durable-state-file'
import { decodePersistedState } from './persisted-state-codec'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false
  }
}))

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function createDurableStateFile(dataFile: string): DurableStateFile {
  return new DurableStateFile({
    dataFile,
    readState: () => getDefaultPersistedState('/home/tester')
  })
}

function decode(value: unknown, fileExistedOnLoad: boolean) {
  return decodePersistedState(value, {
    homeDir: '/home/tester',
    platform: 'linux',
    fileExistedOnLoad,
    createInstallId: () => 'install-id',
    now: () => 123
  })
}

describe('DurableStateFile recovery', () => {
  it('restores a backup when the primary file is missing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'yiru-durable-state-'))
    temporaryDirectories.push(directory)
    const dataFile = join(directory, 'state.json')
    writeFileSync(`${dataFile}.bak.0`, JSON.stringify({ schemaVersion: 7, sshTargets: [] }))

    const result = createDurableStateFile(dataFile).readDecoded(({ value, fileExistedOnLoad }) =>
      decode(value, fileExistedOnLoad)
    )

    expect(result.state.schemaVersion).toBe(7)
    expect(JSON.parse(readFileSync(dataFile, 'utf8'))).toMatchObject({ schemaVersion: 7 })
  })

  it('rejects a parseable malformed primary before accepting a healthy backup', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const directory = mkdtempSync(join(tmpdir(), 'yiru-durable-state-'))
    temporaryDirectories.push(directory)
    const dataFile = join(directory, 'state.json')
    writeFileSync(dataFile, JSON.stringify({ schemaVersion: 99, sshTargets: {} }))
    writeFileSync(`${dataFile}.bak.0`, JSON.stringify({ schemaVersion: 8, sshTargets: [] }))

    const result = createDurableStateFile(dataFile).readDecoded(({ value, fileExistedOnLoad }) =>
      decode(value, fileExistedOnLoad)
    )

    expect(result.state.schemaVersion).toBe(8)
    expect(JSON.parse(readFileSync(dataFile, 'utf8'))).toMatchObject({ schemaVersion: 8 })
  })

  it('uses fresh onboarding defaults after an existing file cannot be recovered', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const directory = mkdtempSync(join(tmpdir(), 'yiru-durable-state-'))
    temporaryDirectories.push(directory)
    const dataFile = join(directory, 'state.json')
    writeFileSync(dataFile, 'null')

    const result = createDurableStateFile(dataFile).readDecoded(({ value, fileExistedOnLoad }) =>
      decode(value, fileExistedOnLoad)
    )

    expect(result.state.onboarding).toMatchObject({ closedAt: null, outcome: null })
    expect(result.state.settings.telemetry).toMatchObject({
      existedBeforeTelemetryRelease: true,
      optedIn: null
    })
  })
})
