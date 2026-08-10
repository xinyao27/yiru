import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { getRuntimeHostSecureStorageProvider } from '../runtime/host/secure-storage-provider'

type StoredOpenAiKey = {
  encryptedKeyBase64: string
}

const OPENAI_SPEECH_TOKEN_FILE = 'openai-speech-token.enc'
let cachedOpenAiSpeechApiKey: string | null = null
let allowPlaintextStorage = true
let storageDirectoryProvider = (): string => join(homedir(), '.yiru')

function getYiruDir(): string {
  return storageDirectoryProvider()
}

export function configureOpenAiSpeechStorage(options: {
  allowPlaintext: boolean
  directory: () => string
}): void {
  allowPlaintextStorage = options.allowPlaintext
  storageDirectoryProvider = options.directory
  cachedOpenAiSpeechApiKey = null
}

function ensureYiruDir(): void {
  const dir = getYiruDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function getOpenAiKeyPath(): string {
  return join(getYiruDir(), OPENAI_SPEECH_TOKEN_FILE)
}

function readLegacyJsonStoredOpenAiKey(): StoredOpenAiKey | null {
  const keyPath = getOpenAiKeyPath()
  if (!existsSync(keyPath)) {
    return null
  }
  try {
    const parsed = JSON.parse(readFileSync(keyPath, 'utf8')) as Partial<StoredOpenAiKey>
    if (typeof parsed.encryptedKeyBase64 !== 'string' || parsed.encryptedKeyBase64 === '') {
      return null
    }
    return { encryptedKeyBase64: parsed.encryptedKeyBase64 }
  } catch {
    return null
  }
}

export function hasOpenAiSpeechApiKey(): boolean {
  // Why: Settings and model-state refresh call this on startup; checking file
  // existence avoids decrypting safeStorage and triggering macOS keychain prompts.
  const canRead =
    allowPlaintextStorage || getRuntimeHostSecureStorageProvider()?.isEncryptionAvailable() === true
  return canRead && existsSync(getOpenAiKeyPath())
}

export function saveOpenAiSpeechApiKey(apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) {
    throw new Error('OpenAI API key is required')
  }
  ensureYiruDir()
  const secureStorage = getRuntimeHostSecureStorageProvider()
  if (secureStorage?.isEncryptionAvailable()) {
    writeFileSync(getOpenAiKeyPath(), secureStorage.encryptString(trimmed), { mode: 0o600 })
    cachedOpenAiSpeechApiKey = trimmed
    return
  }

  if (!allowPlaintextStorage) {
    throw new Error('Speech key encryption is unavailable')
  }
  console.warn(
    '[speech] safeStorage encryption unavailable — storing OpenAI speech key in plaintext'
  )
  writeFileSync(getOpenAiKeyPath(), trimmed, { encoding: 'utf8', mode: 0o600 })
  cachedOpenAiSpeechApiKey = trimmed
}

export function readOpenAiSpeechApiKey(): string {
  if (cachedOpenAiSpeechApiKey !== null) {
    return cachedOpenAiSpeechApiKey
  }

  const keyPath = getOpenAiKeyPath()
  if (!existsSync(keyPath)) {
    throw new Error('OpenAI API key is not configured')
  }
  try {
    const raw = readFileSync(keyPath)
    const legacyJson = readLegacyJsonStoredOpenAiKey()
    if (legacyJson) {
      const secureStorage = getRuntimeHostSecureStorageProvider()
      if (!secureStorage?.isEncryptionAvailable()) {
        throw new Error('Speech key encryption is unavailable')
      }
      cachedOpenAiSpeechApiKey = secureStorage.decryptString(
        Buffer.from(legacyJson.encryptedKeyBase64, 'base64')
      )
      return cachedOpenAiSpeechApiKey
    }
    const secureStorage = getRuntimeHostSecureStorageProvider()
    if (!secureStorage?.isEncryptionAvailable() && !allowPlaintextStorage) {
      throw new Error('Speech key encryption is unavailable')
    }
    cachedOpenAiSpeechApiKey = secureStorage?.isEncryptionAvailable()
      ? secureStorage.decryptString(raw)
      : readPlaintextKey(raw)
    return cachedOpenAiSpeechApiKey
  } catch {
    throw new Error('OpenAI API key could not be decrypted')
  }
}

function readPlaintextKey(raw: Buffer): string {
  const plaintext = raw.toString('utf8').trim()
  if (!plaintext || !Buffer.from(plaintext, 'utf8').equals(raw)) {
    throw new Error('Speech key encryption is unavailable')
  }
  return plaintext
}

export function clearOpenAiSpeechApiKey(): void {
  cachedOpenAiSpeechApiKey = null
  rmSync(getOpenAiKeyPath(), { force: true })
}
