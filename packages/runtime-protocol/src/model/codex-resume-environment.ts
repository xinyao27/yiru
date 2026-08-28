// Why: a bare real-home resume must not inherit an account-routed home from
// the parent app or daemon, or it silently opens the session under the wrong identity.
export function realHomeCodexResumeEnvDeletion(session: {
  agent: string
  codexHome: string | null
}): { envToDelete: string[] } | Record<string, never> {
  if (session.agent !== 'codex' || session.codexHome !== null) {
    return {}
  }
  return { envToDelete: ['CODEX_HOME', 'YIRU_CODEX_HOME'] }
}
