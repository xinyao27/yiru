/**
 * Compatibility barrel for shared terminal agent-title detection.
 *
 * Why shared: main and renderer both consume OSC titles for facts, stats, and
 * UI state. Keep existing imports stable while the implementation stays split
 * into focused modules that satisfy max-lines. (main's #7612 split into
 * `terminal-title-*` modules coexists — those files stay on disk for their
 * direct `resolveTerminalTitleAgentType`/`synthetic-agent-title` consumers.)
 */

export type { AgentStatus } from '@yiru/runtime-protocol/model/agent'
export {
  isClaudeManagementTitle,
  isCursorAgentTitle,
  isCursorNativeAgentTitle,
  isGeminiTerminalTitle,
  isPiTerminalTitle,
  STRONG_IDLE_KEYWORDS_RE,
  STRONG_WORKING_KEYWORDS_RE
} from '@yiru/runtime-protocol/model/agent'
export {
  isOpenCodeNativeTitle,
  isMeaningfulOpenCodeTerminalTitle
} from '@yiru/runtime-protocol/model/agent'
export { getAgentLabel, isClaudeAgent } from './title-identity'
export {
  clearWorkingIndicators,
  createAgentStatusTracker,
  detectAgentStatusFromTitle,
  normalizeTerminalTitle
} from './title-status'

// Re-export so existing `agent-detection` importers keep working.
export { AGENT_NAMES, titleHasAgentName } from '@yiru/runtime-protocol/model/agent'
export {
  extractAllOscTitles,
  extractLastOscTitle,
  MAX_OSC_TITLE_CHARS
} from '../osc-title-extraction'
export { isShellProcess } from '../shell-process-detection'
