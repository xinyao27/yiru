import { resolveLocalhostHttpLinkDisplayUrl } from '../editor/http-link-routing'

export function extractTerminalUncHost(value: string | undefined): string | null {
  const match = /^(?:\\\\|\/\/)([^\\/]+)/.exec(value ?? '')
  return match?.[1] || null
}

export async function formatTerminalUrlTooltip(
  url: string,
  openLinkHint: string
): Promise<string | null> {
  const labeledUrl = await resolveLocalhostHttpLinkDisplayUrl(url)
  if (!labeledUrl) {
    return null
  }
  try {
    return `${labeledUrl} (${new URL(url).host}; ${openLinkHint})`
  } catch {
    return `${labeledUrl} (${openLinkHint})`
  }
}
