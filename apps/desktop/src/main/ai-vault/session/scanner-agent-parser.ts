import type { AiVaultSession } from '@yiru/workbench-model/agent'

import { parseAntigravitySessionFile } from './scanner-antigravity-parser'
import { parseCodexSessionFile } from './scanner-codex-parser'
import { parseDevinSessionFile } from './scanner-devin-parser'
import { parseDroidSessionFile } from './scanner-droid-parser'
import { parseGeminiSessionFile } from './scanner-gemini-parsers'
import { parseMessageGraphSessionFile, parseRovoSessionFile } from './scanner-graph-parsers'
import { parseGrokSessionFile } from './scanner-grok-parser'
import { parseKimiSessionFile } from './scanner-kimi-parser'
import { parseOpenCodeSqliteSession } from './scanner-opencode-sqlite'
import { splitOpenCodeSqliteCandidate } from './scanner-opencode-sqlite-paths'
import { parseClaudeSessionFile } from './scanner-primary-parsers'
import {
  parseCopilotSessionFile,
  parseCursorSessionFile,
  parseHermesSessionFile,
  parseOpenCodeSessionFile
} from './scanner-secondary-parsers'
import type { SessionFileCandidate } from './scanner-types'

/**
 * Parse a single agent session file into an `AiVaultSession`. Routes to the
 * appropriate agent-specific parser based on `candidate.agent`. For OpenCode
 * SQLite candidates (synthetic `db#id` paths), routes to
 * `parseOpenCodeSqliteSession` instead of the legacy JSON parser.
 * @param candidate - The session file candidate to parse.
 * @param platform - The platform to use for resume command generation.
 * @returns The parsed `AiVaultSession`, or `null` if parsing fails.
 */
export async function parseAgentSessionFile(
  candidate: SessionFileCandidate,
  platform: NodeJS.Platform
): Promise<AiVaultSession | null> {
  switch (candidate.agent) {
    case 'claude':
      return parseClaudeSessionFile(candidate.file, platform)
    case 'codex':
      return parseCodexSessionFile(candidate.file, platform, candidate.codexHome)
    case 'gemini':
      return parseGeminiSessionFile(candidate.file, platform)
    case 'antigravity':
      return parseAntigravitySessionFile(candidate.file, platform)
    case 'copilot':
      return parseCopilotSessionFile(candidate.file, platform)
    case 'cursor':
      return parseCursorSessionFile(candidate.file, platform)
    case 'opencode': {
      // Why: OpenCode 1.17.x sessions are read from SQLite via a synthetic
      // <dbPath>#<sessionId> candidate path. Legacy file-based sessions use
      // real filesystem paths and fall through to the JSON parser.
      const sqliteCandidate = splitOpenCodeSqliteCandidate(candidate.file.path)
      if (sqliteCandidate) {
        return parseOpenCodeSqliteSession({
          dbPath: sqliteCandidate.dbPath,
          sessionId: sqliteCandidate.sessionId,
          platform
        })
      }
      return parseOpenCodeSessionFile(candidate.file, platform)
    }
    case 'grok':
      return parseGrokSessionFile(candidate.file, platform)
    case 'hermes':
      return parseHermesSessionFile(candidate.file, platform)
    case 'rovo':
      return parseRovoSessionFile(candidate.file, platform)
    case 'openclaw':
      return parseMessageGraphSessionFile('openclaw', candidate.file, platform)
    case 'pi':
      return parseMessageGraphSessionFile('pi', candidate.file, platform)
    case 'omp':
      return parseMessageGraphSessionFile('omp', candidate.file, platform)
    case 'droid':
      return parseDroidSessionFile(candidate.file, platform)
    case 'devin':
      return parseDevinSessionFile(candidate.file, platform)
    case 'kimi':
      return parseKimiSessionFile(candidate.file, platform)
  }
}
