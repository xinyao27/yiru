import type { AiVaultListResult, AiVaultSession } from '../shared/ai-vault-types'

export function formatSessionList(result: AiVaultListResult): string {
  if (result.sessions.length === 0) {
    return 'No AI sessions found.'
  }
  return result.sessions.map(formatSession).join('\n\n')
}

function formatSession(session: AiVaultSession): string {
  const location = session.cwd ?? 'Unknown working directory'
  const detail = [session.agent, session.branch, session.model].filter(Boolean).join(' · ')
  return [
    `${session.title || 'Untitled session'}${detail ? `  (${detail})` : ''}`,
    `  updated: ${session.updatedAt ?? session.modifiedAt}`,
    `  cwd: ${location}`,
    `  session: ${session.sessionId}`,
    `  resume: ${session.resumeCommand}`
  ].join('\n')
}
