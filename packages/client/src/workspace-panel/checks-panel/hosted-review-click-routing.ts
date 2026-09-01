import type { WebLinkMouseEvent } from '~renderer/browser/link-gesture'
import { openHttpLink } from '~renderer/editor/http-link-routing'

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
