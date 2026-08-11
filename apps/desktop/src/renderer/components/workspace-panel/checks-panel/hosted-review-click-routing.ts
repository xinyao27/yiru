import { openHttpLink } from '~renderer/components/editor/http-link-routing'

export function openChecksPanelHostedReviewUrl({
  url,
  worktreeId
}: {
  url: string
  worktreeId: string | null | undefined
}): void {
  openHttpLink(url, { worktreeId })
}
