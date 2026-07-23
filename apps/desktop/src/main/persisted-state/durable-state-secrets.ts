import { safeStorage } from 'electron'

import type { PersistedState } from '../../shared/types'

function encrypt(plaintext: string): string {
  if (!plaintext || !safeStorage.isEncryptionAvailable()) {
    return plaintext
  }
  try {
    return safeStorage.encryptString(plaintext).toString('base64')
  } catch (error) {
    console.error('[persistence] Encryption failed:', error)
    return plaintext
  }
}

function decrypt(ciphertext: string): string {
  if (!ciphertext || !safeStorage.isEncryptionAvailable()) {
    return ciphertext
  }
  try {
    return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))
  } catch {
    // Why: pre-encryption plaintext and keychain resets must remain readable;
    // returning the raw value preserves the user's existing secret.
    console.warn(
      '[persistence] safeStorage decryption failed — returning ciphertext as-is. Possible keychain reset.'
    )
    return ciphertext
  }
}

export function decryptDurableStateSecrets(value: unknown): unknown {
  const persisted = value as Partial<PersistedState> | null | undefined
  if (persisted?.settings?.opencodeSessionCookie) {
    persisted.settings.opencodeSessionCookie = decrypt(persisted.settings.opencodeSessionCookie)
  }
  if (persisted?.settings?.httpProxyUrl) {
    persisted.settings.httpProxyUrl = decrypt(persisted.settings.httpProxyUrl)
  }
  if (persisted?.ui?.browserKagiSessionLink) {
    persisted.ui.browserKagiSessionLink = decrypt(persisted.ui.browserKagiSessionLink)
  }
  return value
}

export function serializeDurableState(state: PersistedState): string {
  const { githubCache: _memoryOnly, ...durable } = state
  const document = {
    ...durable,
    settings: {
      ...state.settings,
      opencodeSessionCookie: encrypt(state.settings.opencodeSessionCookie),
      httpProxyUrl: encrypt(state.settings.httpProxyUrl ?? '')
    },
    ui: {
      ...state.ui,
      browserKagiSessionLink: state.ui.browserKagiSessionLink
        ? encrypt(state.ui.browserKagiSessionLink)
        : null
    }
  }
  return JSON.stringify(document, null, 2)
}
