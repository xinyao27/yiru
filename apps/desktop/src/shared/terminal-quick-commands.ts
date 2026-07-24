// Compatibility surface for desktop call sites; the cross-client policy lives
// in workbench-model so mobile and desktop normalize the same saved commands.
export {
  applyTerminalQuickCommandMutation,
  buildTerminalQuickCommandInput,
  flattenTerminalQuickCommand,
  getDefaultTerminalQuickCommands,
  getTerminalQuickCommandAction,
  getTerminalQuickCommandBody,
  getTerminalQuickCommandScope,
  isTerminalAgentQuickCommand,
  isTerminalQuickCommandComplete,
  MAX_QUICK_COMMANDS,
  MAX_QUICK_COMMAND_AGENT_PROMPT_LENGTH,
  MAX_QUICK_COMMAND_ID_LENGTH,
  MAX_QUICK_COMMAND_LABEL_LENGTH,
  MAX_QUICK_COMMAND_REPO_ID_LENGTH,
  MAX_QUICK_COMMAND_TERMINAL_TEXT_LENGTH,
  normalizeTerminalQuickCommands,
  parseNormalizedTerminalQuickCommands,
  supportsTerminalAgentQuickCommand,
  terminalQuickCommandMatchesRepo,
  type TerminalQuickCommandMutation
} from '@yiru/workbench-model/ui'
