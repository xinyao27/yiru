import type { PersistedState } from '@yiru/runtime-protocol/workbench/types'

import { getRuntimeHostSecureStorageProvider } from '../runtime/host/secure-storage-provider'

function decrypt(ciphertext: string): string {
  const secureStorage = getRuntimeHostSecureStorageProvider()
  if (!ciphertext || !secureStorage?.isEncryptionAvailable()) {
    return ciphertext
  }
  try {
    return secureStorage.decryptString(Buffer.from(ciphertext, 'base64'))
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
