import { getWorktreeMapFromState } from '~renderer/store/selectors'
import type { AppState } from '~renderer/store/types'

export function selectMarkdownDocumentWorktreePath(
  state: Pick<AppState, 'worktreesByRepo'>,
  worktreeId: string | null | undefined
): string | null {
  if (!worktreeId) {
    return null
  }
  return getWorktreeMapFromState(state).get(worktreeId)?.path ?? null
}
