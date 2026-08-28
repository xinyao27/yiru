import { readFileSync, rmSync } from 'node:fs'
import { join, win32 } from 'node:path'

import { writeSecureJsonFile } from './secure-file'

export type RuntimeTransportMetadata =
  | { endpoint: string; kind: 'unix' }
  | { endpoint: string; kind: 'named-pipe' }
  | { endpoint: string; kind: 'websocket' }

export type RuntimeMetadata = {
  authToken: string | null
  pid: number
  runtimeId: string
  startedAt: number
  transports: RuntimeTransportMetadata[]
}

const RUNTIME_METADATA_FILE_NAME = 'yiru-runtime.json'

export function readRuntimeMetadata(userDataPath: string): RuntimeMetadata | null {
  try {
    return parseRuntimeMetadata(JSON.parse(readFileSync(runtimeMetadataPath(userDataPath), 'utf8')))
  } catch {
    return null
  }
}

export function writeRuntimeMetadata(userDataPath: string, metadata: RuntimeMetadata): void {
  writeSecureJsonFile(runtimeMetadataPath(userDataPath), metadata)
}

export function clearRuntimeMetadataIfOwned(
  userDataPath: string,
  ownedPid: number,
  ownedRuntimeId: string
): void {
  const current = readRuntimeMetadata(userDataPath)
  if (current?.pid === ownedPid && current.runtimeId === ownedRuntimeId) {
    rmSync(runtimeMetadataPath(userDataPath), { force: true })
  }
}

export function createLocalTransportMetadata(
  userDataPath: string,
  pid: number,
  runtimeId: string
): Extract<RuntimeTransportMetadata, { kind: 'unix' | 'named-pipe' }> {
  const suffix = runtimeId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 4) || 'rt'
  if (process.platform === 'win32') {
    return {
      endpoint: win32.join('\\\\.\\pipe', `yiru-${pid}-${suffix}`),
      kind: 'named-pipe'
    }
  }
  return { endpoint: join(userDataPath, `o-${pid}-${suffix}.sock`), kind: 'unix' }
}

function runtimeMetadataPath(userDataPath: string): string {
  return join(userDataPath, RUNTIME_METADATA_FILE_NAME)
}

function parseRuntimeMetadata(value: unknown): RuntimeMetadata | null {
  if (!isRecord(value)) {
    return null
  }
  const transports = parseTransports(value.transports ?? value.transport)
  if (
    typeof value.runtimeId !== 'string' ||
    typeof value.pid !== 'number' ||
    !Number.isInteger(value.pid) ||
    typeof value.startedAt !== 'number' ||
    (value.authToken !== null && typeof value.authToken !== 'string') ||
    transports.length === 0
  ) {
    return null
  }
  return {
    authToken: value.authToken,
    pid: value.pid,
    runtimeId: value.runtimeId,
    startedAt: value.startedAt,
    transports
  }
}

function parseTransports(value: unknown): RuntimeTransportMetadata[] {
  const items = Array.isArray(value) ? value : [value]
  const transports: RuntimeTransportMetadata[] = []
  for (const item of items) {
    if (
      isRecord(item) &&
      typeof item.endpoint === 'string' &&
      (item.kind === 'unix' || item.kind === 'named-pipe' || item.kind === 'websocket')
    ) {
      transports.push({ endpoint: item.endpoint, kind: item.kind })
    }
  }
  return transports
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
