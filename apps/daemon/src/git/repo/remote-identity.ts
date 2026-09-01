export type GitRemoteIdentity = {
  canonicalKey: string
  remoteName: string
  remoteUrl: string
}

export function normalizeGitRemote(
  remoteName: string,
  remoteUrl: string
): GitRemoteIdentity | null {
  const trimmed = remoteUrl.trim()
  const scpMatch = /^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/.exec(trimmed)
  if (scpMatch) {
    return createIdentity(remoteName, trimmed, scpMatch[1], scpMatch[2])
  }
  try {
    const url = new URL(trimmed)
    if (!['git:', 'http:', 'https:', 'ssh:'].includes(url.protocol)) {
      return null
    }
    const host = `${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}`
    return createIdentity(remoteName, trimmed, host, url.pathname)
  } catch {
    return null
  }
}

function createIdentity(
  remoteName: string,
  remoteUrl: string,
  host: string,
  rawPath: string
): GitRemoteIdentity | null {
  const path = rawPath
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/i, '')
    .toLowerCase()
  if (!host || !path) {
    return null
  }
  return {
    canonicalKey: `${host.toLowerCase()}/${path}`,
    remoteName,
    remoteUrl
  }
}
