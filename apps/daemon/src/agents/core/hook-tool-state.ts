import { isKnownHarnessInjectedUserTurnText } from '@yiru/runtime-protocol/model/agent'

import type { HookListenerState } from './hook-listener-state'

export function resolvePrompt(
  state: HookListenerState,
  paneKey: string,
  promptText: string,
  options?: { resetOnNewTurn?: boolean }
): string {
  // Why: harness-injected turns (task notifications, system reminders) fire
  // UserPromptSubmit but are not the user's ask — keep the cached real prompt
  // instead of surfacing raw machinery tags in status labels. Match only known
  // harness tags: a real prompt pasting a custom `<my-element>` must reset the
  // turn, not be mistaken for machinery and leave the pane on a stale prompt.
  if (isKnownHarnessInjectedUserTurnText(promptText)) {
    return state.lastPromptByPaneKey.get(paneKey) ?? ''
  }
  if (options?.resetOnNewTurn) {
    state.lastPromptByPaneKey.delete(paneKey)
  }
  if (promptText) {
    state.lastPromptByPaneKey.set(paneKey, promptText)
    return promptText
  }
  return state.lastPromptByPaneKey.get(paneKey) ?? ''
}

export type ToolSnapshot = {
  toolName?: string
  toolInput?: string
  /** Full JSON of an AskUserQuestion tool input, set only on the event that
   *  carries it. Deliberately NOT inherited across events in resolveToolState
   *  so it clears the moment the agent moves to a different tool / state and a
   *  stale prompt can't linger on the emitted payload. */
  interactivePrompt?: string
  hasToolUpdate?: boolean
  hasToolInputField?: boolean
  lastAssistantMessage?: string
  clearLastAssistantMessage?: boolean
}

export function resolveToolState(
  state: HookListenerState,
  paneKey: string,
  update: ToolSnapshot,
  options: { resetOnNewTurn: boolean }
): ToolSnapshot {
  if (options.resetOnNewTurn) {
    state.lastToolByPaneKey.delete(paneKey)
  }
  const previous = state.lastToolByPaneKey.get(paneKey) ?? {}
  // Why: `undefined` can mean "no update" or "explicit input was not
  // previewable"; extractor metadata decides whether stale input is inherited.
  const clearsUnpreviewableInput =
    update.hasToolInputField === true && update.toolInput === undefined
  const clearsUnidentifiedTool =
    update.hasToolUpdate === true &&
    update.toolName === undefined &&
    update.hasToolInputField === true
  const toolName = clearsUnidentifiedTool ? undefined : (update.toolName ?? previous.toolName)
  const toolInput =
    clearsUnpreviewableInput ||
    (update.toolName !== undefined &&
      update.toolName !== previous.toolName &&
      update.toolInput === undefined)
      ? undefined
      : (update.toolInput ?? previous.toolInput)
  const merged: ToolSnapshot = {
    toolName,
    toolInput,
    // Why: do NOT inherit `previous.interactivePrompt`. The prompt is only
    // valid for the single AskUserQuestion event that produced it; carrying it
    // forward would leave a stale live card on the next tool/state change.
    interactivePrompt: update.interactivePrompt,
    lastAssistantMessage: update.clearLastAssistantMessage
      ? undefined
      : (update.lastAssistantMessage ?? previous.lastAssistantMessage)
  }
  state.lastToolByPaneKey.set(paneKey, merged)
  return merged
}

export const TOOL_INPUT_KEYS_BY_TOOL: Record<string, readonly string[]> = {
  Read: ['file_path', 'filePath', 'path'],
  Write: ['file_path', 'filePath', 'path'],
  Create: ['file_path', 'filePath', 'path'],
  Edit: ['file_path', 'filePath', 'path'],
  Execute: ['command'],
  MultiEdit: ['file_path', 'filePath', 'path'],
  NotebookEdit: ['file_path', 'filePath', 'path'],
  Bash: ['command'],
  Glob: ['pattern'],
  Grep: ['pattern'],
  WebFetch: ['url'],
  WebSearch: ['query'],
  FetchUrl: ['url'],
  read_file: ['file_path', 'path'],
  write_file: ['file_path', 'path'],
  read_many_files: ['file_path', 'paths', 'path'],
  edit_file: ['file_path', 'path'],
  replace: ['file_path', 'path'],
  run_shell_command: ['command'],
  run_command: ['CommandLine', 'command', 'cmd'],
  glob: ['pattern'],
  search_file_content: ['pattern'],
  web_fetch: ['url'],
  google_web_search: ['query'],
  exec_command: ['cmd', 'command'],
  shell_command: ['cmd', 'command'],
  run_terminal_cmd: ['command'],
  // Why: Grok maps Bash/Edit/Write to snake_case first-party tool names
  // (run_terminal_command, search_replace, …). Without these keys the status
  // row shows a blank toolInput for the bulk of Grok tool turns.
  run_terminal_command: ['command'],
  search_replace: ['file_path', 'path', 'filePath'],
  write_to_file: ['TargetFile', 'path', 'file_path'],
  execute_code: ['code', 'command', 'cmd'],
  apply_patch: ['path', 'file_path'],
  view_image: ['path', 'file_path'],
  AskUser: ['question', 'prompt', 'message'],
  ask_user: ['question', 'prompt', 'message'],
  AskUserQuestion: ['questions', 'question', 'prompt', 'message'],
  ask_user_question: ['questions', 'question', 'prompt', 'message'],
  bash: ['command'],
  powershell: ['command'],
  create: ['path', 'file_path'],
  read: ['path', 'file_path'],
  write: ['path', 'file_path'],
  edit: ['path', 'file_path'],
  view: ['path', 'file_path'],
  grep: ['pattern'],
  web_search: ['query'],
  fetch_content: ['url'],
  terminal: ['command'],
  patch: ['path', 'file_path'],
  search_files: ['query', 'pattern', 'path'],
  browser_navigate: ['url'],
  browser_click: ['target', 'selector', 'text'],
  browser_type: ['text', 'target', 'selector'],
  session_search: ['query'],
  skill_manage: ['action', 'name', 'file_path'],
  delegate_task: ['task', 'prompt', 'description'],
  view_file: ['AbsolutePath', 'path', 'file_path'],
  replace_file_content: ['TargetFile', 'path', 'file_path'],
  multi_replace_file_content: ['TargetFile', 'path', 'file_path'],
  list_dir: ['DirectoryPath', 'path'],
  find_by_name: ['SearchDirectory', 'Pattern', 'query'],
  grep_search: ['SearchPath', 'Query', 'query', 'pattern'],
  search_web: ['query'],
  read_url_content: ['Url', 'url'],
  manage_task: ['TaskId', 'Action'],
  schedule: ['Prompt', 'DurationSeconds', 'CronExpression'],
  ask_question: ['question', 'questions'],
  ask_permission: ['Action', 'Target', 'Reason'],
  spawn_subagent: ['prompt', 'description', 'subagent_type'],
  open_page: ['url']
}

export const FALLBACK_TOOL_INPUT_KEYS = [
  'command',
  'cmd',
  'code',
  'query',
  'pattern',
  'url',
  'path',
  'file_path',
  'filePath',
  'target',
  'selector',
  'text',
  'action',
  'name',
  'description',
  'CommandLine',
  'AbsolutePath',
  'TargetFile',
  'DirectoryPath',
  'SearchPath',
  'Query',
  'Url',
  'Prompt'
] as const

export function deriveToolInputPreview(
  toolName: string | undefined,
  toolInput: unknown
): string | undefined {
  if (typeof toolInput === 'string') {
    return toolInput
  }
  if (typeof toolInput !== 'object' || toolInput === null) {
    return undefined
  }
  if (!toolName) {
    return undefined
  }
  const keys = TOOL_INPUT_KEYS_BY_TOOL[toolName]
  if (!keys) {
    return undefined
  }
  const record = toolInput as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }
  return undefined
}

export function deriveFallbackToolInputPreview(toolInput: unknown): string | undefined {
  if (typeof toolInput === 'string') {
    return toolInput
  }
  if (typeof toolInput !== 'object' || toolInput === null) {
    return undefined
  }
  const record = toolInput as Record<string, unknown>
  for (const key of FALLBACK_TOOL_INPUT_KEYS) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }
  return undefined
}
