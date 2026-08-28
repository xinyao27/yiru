export type RuntimeHostSecureStorageProvider = {
  decryptString: (value: Buffer) => string
  encryptString: (value: string) => Buffer
  isEncryptionAvailable: () => boolean
}

let secureStorageProvider: RuntimeHostSecureStorageProvider | null = null

export function getRuntimeHostSecureStorageProvider(): RuntimeHostSecureStorageProvider | null {
  return secureStorageProvider
}

export function setRuntimeHostSecureStorageProvider(
  provider: RuntimeHostSecureStorageProvider
): void {
  secureStorageProvider = provider
}
