export type LanguageServerSettings = {
  enabled: boolean
  command: string
  args: string[]
  languageIds: string[]
}

export const DEFAULT_LANGUAGE_SERVER_SETTINGS: LanguageServerSettings = {
  enabled: false,
  command: '',
  args: [],
  languageIds: []
}

const MAX_COMMAND_LENGTH = 2_048
const MAX_ARGUMENT_COUNT = 64
const MAX_ARGUMENT_LENGTH = 4_096
const MAX_LANGUAGE_COUNT = 32
const LANGUAGE_ID_PATTERN = /^[A-Za-z0-9_.+-]{1,64}$/

export function normalizeLanguageServerSettings(value: unknown): LanguageServerSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_LANGUAGE_SERVER_SETTINGS }
  }
  const candidate = value as Partial<LanguageServerSettings>
  const command = typeof candidate.command === 'string' ? candidate.command.trim() : ''
  const args = Array.isArray(candidate.args)
    ? candidate.args
        .filter(
          (arg): arg is string =>
            typeof arg === 'string' && arg.trim().length > 0 && !arg.includes('\0')
        )
        .slice(0, MAX_ARGUMENT_COUNT)
        .map((arg) => arg.slice(0, MAX_ARGUMENT_LENGTH))
    : []
  const languageIds = Array.isArray(candidate.languageIds)
    ? [...new Set(candidate.languageIds.filter((id) => LANGUAGE_ID_PATTERN.test(id)))].slice(
        0,
        MAX_LANGUAGE_COUNT
      )
    : []

  return {
    enabled: candidate.enabled === true,
    command: command.includes('\0') ? '' : command.slice(0, MAX_COMMAND_LENGTH),
    args,
    languageIds
  }
}

export type LanguageServerJsonRpcId = number | string | null

export type LanguageServerJsonRpcMessage = {
  jsonrpc: '2.0'
  id?: LanguageServerJsonRpcId
  method?: string
  params?: unknown
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export type LanguageServerStartArgs = {
  worktreeId: string
  languageId: string
}

export type LanguageServerStartResult = {
  sessionId: string
  workspacePath: string
  workspaceUri: string
  commandLabel: string
}

export type LanguageServerSendArgs = {
  sessionId: string
  message: LanguageServerJsonRpcMessage
}

export type LanguageServerDocumentUriArgs = {
  sessionId: string
  filePath: string
}

export type LanguageServerDocumentUriResult = {
  uri: string
}

export type LanguageServerLocationArgs = {
  sessionId: string
  uri: string
}

export type LanguageServerLocationResult = {
  filePath: string
  relativePath: string
}

export type LanguageServerSessionStatus = 'running' | 'stopped' | 'failed'

export type LanguageServerEvent =
  | {
      type: 'message'
      sessionId: string
      message: LanguageServerJsonRpcMessage
    }
  | {
      type: 'status'
      sessionId: string
      status: LanguageServerSessionStatus
      message?: string
    }

export type LanguageServerLogsResult = {
  lines: string[]
}
