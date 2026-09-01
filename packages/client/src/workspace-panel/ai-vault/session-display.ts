// Why: the pure preview/search-text core now lives in /shared so mobile can
// reuse it (Metro can't import renderer). Re-export for renderer import parity.
export type { AiVaultSessionDisplayTurn } from '@yiru/runtime-protocol/model/agent'
export {
  latestSessionConversationTurn,
  recentSessionConversationTurns,
  sessionDetailConversationTurns,
  sessionModelLabel,
  sessionPreviewSearchText
} from '@yiru/runtime-protocol/model/agent'
