export type EnterprisePolicy = {
  allowedSiteOrigins: string[]
  daemonEndpoint: string | null
  disableBrowserContext: boolean
  disableCommunityAdapters: boolean
  disableOnDeviceAi: boolean
  protocolVersion: number | null
}

export async function readEnterprisePolicy(): Promise<EnterprisePolicy> {
  const value: unknown = await chrome.storage.managed.get().catch(() => ({}))
  const policy = typeof value === 'object' && value !== null ? value : {}
  return {
    allowedSiteOrigins: parseOrigins(Reflect.get(policy, 'AllowedSiteOrigins')),
    daemonEndpoint: parseEndpoint(Reflect.get(policy, 'DaemonEndpoint')),
    disableBrowserContext: Reflect.get(policy, 'DisableBrowserContext') === true,
    disableCommunityAdapters: Reflect.get(policy, 'DisableCommunityAdapters') === true,
    disableOnDeviceAi: Reflect.get(policy, 'DisableOnDeviceAi') === true,
    protocolVersion: parseProtocolVersion(Reflect.get(policy, 'ProtocolVersion'))
  }
}

function parseOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    try {
      if (typeof entry !== 'string') {
        return []
      }
      const url = new URL(entry)
      return ['http:', 'https:'].includes(url.protocol) && url.origin === entry ? [entry] : []
    } catch {
      return []
    }
  })
}

function parseEndpoint(value: unknown): string | null {
  try {
    if (typeof value !== 'string') {
      return null
    }
    const endpoint = new URL(value)
    return ['ws:', 'wss:'].includes(endpoint.protocol) ? endpoint.href : null
  } catch {
    return null
  }
}

function parseProtocolVersion(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}
