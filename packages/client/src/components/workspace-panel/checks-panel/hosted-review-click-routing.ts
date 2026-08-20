import { openHttpLink } from '~renderer/components/editor/http-link-routing'
import type { WebLinkMouseEvent } from '~renderer/lib/web-link-gesture'

export function openChecksPanelHostedReviewUrl({
  url,
  event,
  worktreeId
}: {
  url: string
  event: WebLinkMouseEvent
  worktreeId: string | null | undefined
}): void {
  openHttpLink(url, { event, worktreeId })
}
