import type { IFilesystemProvider } from './types'

export const SSH_FILESYSTEM_PROVIDER_UNAVAILABLE_MESSAGE =
  'Remote connection dropped. Click Reconnect on the SSH target before retrying.'

// Why: the SSH transport that used to register providers here is gone, so this
// registry is permanently empty. It stays as the single seam every remote-fs
// call site already funnels through — collapsing ~40 callers onto their local
// branch is P3c-5's job, not something to smear across them one at a time.
export function getSshFilesystemProvider(_connectionId: string): IFilesystemProvider | undefined {
  return undefined
}

export function requireSshFilesystemProvider(_connectionId: string): IFilesystemProvider {
  throw new Error(SSH_FILESYSTEM_PROVIDER_UNAVAILABLE_MESSAGE)
}
