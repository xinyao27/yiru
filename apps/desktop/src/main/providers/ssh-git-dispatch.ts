import type { IRemoteGitProvider } from './remote-git-provider-contract'

const sshProviders = new Map<string, IRemoteGitProvider>()

export const SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE =
  'Remote connection dropped. Click Reconnect on the SSH target before retrying.'

export function registerSshGitProvider(connectionId: string, provider: IRemoteGitProvider): void {
  sshProviders.set(connectionId, provider)
}

export function unregisterSshGitProvider(connectionId: string): void {
  sshProviders.delete(connectionId)
}

export function getSshGitProvider(connectionId: string): IRemoteGitProvider | undefined {
  return sshProviders.get(connectionId)
}

export function requireSshGitProvider(connectionId: string): IRemoteGitProvider {
  const provider = getSshGitProvider(connectionId)
  if (!provider) {
    throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
  }
  return provider
}
