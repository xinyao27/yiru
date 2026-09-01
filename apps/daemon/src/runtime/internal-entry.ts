import { existsSync } from 'node:fs'

export const CODEX_GRANT_ENTRY_COMMAND = '__yiru-codex-grant-entry'
export const WARP_THEME_PARSE_ENTRY_COMMAND = '__yiru-warp-theme-parse-entry'

export function resolveInternalEntryInvocation(command: string): {
  command: string
  args: string[]
} {
  const sourceEntry = process.argv[1]?.trim()
  return sourceEntry && existsSync(sourceEntry) && /\.[cm]?[jt]sx?$/.test(sourceEntry)
    ? { command: process.execPath, args: [sourceEntry, command] }
    : { command: process.execPath, args: [command] }
}
