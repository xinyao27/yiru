import { isClipboardTextByteLengthOverLimit } from '@yiru/workbench-model/ui'

export const GITHUB_WORK_ITEM_OPTION_FILTER_QUERY_MAX_BYTES = 2 * 1024

export function isGitHubWorkItemOptionFilterQueryTooLarge(
  query: string,
  maxBytes = GITHUB_WORK_ITEM_OPTION_FILTER_QUERY_MAX_BYTES
): boolean {
  return isClipboardTextByteLengthOverLimit(query, maxBytes)
}
