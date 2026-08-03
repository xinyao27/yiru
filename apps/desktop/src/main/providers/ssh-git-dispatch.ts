import type { IRemoteGitProvider } from './remote-git-provider-contract'

export const SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE =
  'Remote connection dropped. Click Reconnect on the SSH target before retrying.'

// Why: the SSH transport that used to register providers here is gone, so this
// registry is permanently empty. It stays as the single seam every remote-git
// call site already funnels through — collapsing ~40 callers onto their local
// branch is P3c-5's job, not something to smear across them one at a time.
export function getSshGitProvider(_connectionId: string): IRemoteGitProvider | undefined {
  return undefined
}

export function requireSshGitProvider(_connectionId: string): IRemoteGitProvider {
  throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
}
