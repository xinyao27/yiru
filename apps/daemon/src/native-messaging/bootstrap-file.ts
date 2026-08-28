import { readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

import { writeSecureJsonFile } from '../runtime/secure-file'

const EXTENSION_BOOTSTRAP_FILE_NAME = 'extension-bootstrap.json'

export type DaemonExtensionBootstrap = {
  authToken: string
  endpoint: string
  protocolVersion: number
  runtimeId: string
}

export function writeExtensionBootstrap(
  userDataPath: string,
  pid: number,
  bootstrap: DaemonExtensionBootstrap
): void {
  const filePath = extensionBootstrapPath(userDataPath, pid)
  writeSecureJsonFile(filePath, bootstrap)
}

export function readExtensionBootstrap(
  userDataPath: string,
  pid: number
): DaemonExtensionBootstrap {
  const value: unknown = JSON.parse(readFileSync(extensionBootstrapPath(userDataPath, pid), 'utf8'))
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof Reflect.get(value, 'authToken') !== 'string' ||
    typeof Reflect.get(value, 'endpoint') !== 'string' ||
    typeof Reflect.get(value, 'protocolVersion') !== 'number' ||
    typeof Reflect.get(value, 'runtimeId') !== 'string'
  ) {
    throw new Error('extension_bootstrap_invalid')
  }
  return {
    authToken: Reflect.get(value, 'authToken'),
    endpoint: Reflect.get(value, 'endpoint'),
    protocolVersion: Reflect.get(value, 'protocolVersion'),
    runtimeId: Reflect.get(value, 'runtimeId')
  }
}

export function readExtensionBootstrapIfExists(
  userDataPath: string,
  pid: number
): DaemonExtensionBootstrap | null {
  try {
    return readExtensionBootstrap(userDataPath, pid)
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
    }
    throw error
  }
}

export function clearExtensionBootstrap(userDataPath: string, pid: number): void {
  try {
    unlinkSync(extensionBootstrapPath(userDataPath, pid))
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error
    }
  }
}

function extensionBootstrapPath(userDataPath: string, pid: number): string {
  return join(userDataPath, 'rh', String(pid), EXTENSION_BOOTSTRAP_FILE_NAME)
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'ENOENT'
}
