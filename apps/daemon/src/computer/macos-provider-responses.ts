import type { MacOSProviderResponse } from './macos-provider-contract'

export function consumeMacOSProviderResponses(input: {
  buffer: string
  chunk: Uint8Array
  decoder: TextDecoder
  handle: (response: MacOSProviderResponse) => void
}): string {
  let remaining = input.buffer + input.decoder.decode(input.chunk, { stream: true })
  let newline = remaining.indexOf('\n')
  while (newline >= 0) {
    const line = remaining.slice(0, newline)
    remaining = remaining.slice(newline + 1)
    if (line.trim()) {
      const response = parseMacOSProviderResponse(line)
      if (response) {
        input.handle(response)
      }
    }
    newline = remaining.indexOf('\n')
  }
  return remaining
}

function parseMacOSProviderResponse(line: string): MacOSProviderResponse | null {
  try {
    const value: unknown = JSON.parse(line)
    if (!value || typeof value !== 'object') {
      return null
    }
    const response = value as Partial<MacOSProviderResponse>
    return typeof response.id === 'number' && typeof response.ok === 'boolean'
      ? (value as MacOSProviderResponse)
      : null
  } catch {
    return null
  }
}
