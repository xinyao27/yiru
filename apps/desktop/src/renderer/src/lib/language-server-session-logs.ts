import type { LanguageServerStartResult } from '../../../shared/language-server'
import type { LanguageServerSessionTransport } from './language-server-session-transport'

const MAX_LOG_LINES = 100

export class LanguageServerSessionLogs {
  private readonly protocol: string[] = []
  private readonly archivedHost: string[] = []

  recordProtocolMessage(message: string): void {
    this.protocol.push(message.slice(0, 2_000))
    this.protocol.splice(0, Math.max(0, this.protocol.length - MAX_LOG_LINES))
  }

  async get(
    transport: LanguageServerSessionTransport,
    startResult: LanguageServerStartResult | null
  ): Promise<string[]> {
    if (!startResult) {
      return [...this.archivedHost, ...this.protocol].slice(-MAX_LOG_LINES)
    }
    const host = await transport
      .getLogs(startResult.sessionId)
      .catch(() => ({ lines: [] as string[] }))
    return [...this.archivedHost, ...host.lines, ...this.protocol].slice(-MAX_LOG_LINES)
  }

  async archive(
    transport: LanguageServerSessionTransport,
    startResult: LanguageServerStartResult | null
  ): Promise<void> {
    if (!startResult) {
      return
    }
    const result = await transport
      .getLogs(startResult.sessionId)
      .catch(() => ({ lines: [] as string[] }))
    this.archivedHost.push(...result.lines.map((line) => `[previous server] ${line}`))
    this.archivedHost.splice(0, Math.max(0, this.archivedHost.length - MAX_LOG_LINES))
  }
}
