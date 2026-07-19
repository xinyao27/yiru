export const AGENT_HOOK_ENDPOINT_FILE_NAMES = ['endpoint.env', 'endpoint.cmd'] as const

export type AgentHookEndpointFileName = (typeof AGENT_HOOK_ENDPOINT_FILE_NAMES)[number]

export type AgentHookEndpoint = {
  port: string
  token: string
  env: string
  version: string
}

export function isAgentHookEndpointFileName(name: string): name is AgentHookEndpointFileName {
  return AGENT_HOOK_ENDPOINT_FILE_NAMES.some((fileName) => fileName === name)
}

export function parseAgentHookEndpointFile(contents: string): AgentHookEndpoint {
  const values = Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const normalizedLine = line.replace(/^set\s+/i, '')
        const [key, ...rest] = normalizedLine.split('=')
        return [key, rest.join('=')]
      })
  )
  if (
    !values.YIRU_AGENT_HOOK_PORT ||
    !values.YIRU_AGENT_HOOK_TOKEN ||
    !values.YIRU_AGENT_HOOK_ENV ||
    !values.YIRU_AGENT_HOOK_VERSION
  ) {
    throw new Error('Agent hook endpoint file is missing required fields')
  }
  return {
    port: values.YIRU_AGENT_HOOK_PORT,
    token: values.YIRU_AGENT_HOOK_TOKEN,
    env: values.YIRU_AGENT_HOOK_ENV,
    version: values.YIRU_AGENT_HOOK_VERSION
  }
}
