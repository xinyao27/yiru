import { join } from 'node:path'

export type AiVaultSessionRuntimeTarget =
  | { runtime: 'host' }
  | { runtime: 'wsl'; wslDistro: string }

export type AiVaultSessionSources = {
  getAdditionalCodexHomePaths?: () => readonly string[]
  resolveClaudeProjectsDirs?: (target: AiVaultSessionRuntimeTarget) => Promise<readonly string[]>
}

let sources: AiVaultSessionSources = {}

export function configureAiVaultSessionSources(next: AiVaultSessionSources): void {
  sources = next
}

export function getConfiguredAiVaultAdditionalCodexSessionsDirs(): string[] {
  return sources.getAdditionalCodexHomePaths?.().map((homePath) => join(homePath, 'sessions')) ?? []
}

export async function getConfiguredAiVaultClaudeProjectsDirs(
  target: AiVaultSessionRuntimeTarget
): Promise<string[] | null> {
  const resolved = await sources.resolveClaudeProjectsDirs?.(target)
  return resolved ? uniquePaths(resolved) : null
}

export function resetAiVaultSessionRootConfigurationForTests(): void {
  sources = {}
}

function uniquePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const path of paths) {
    const trimmed = path.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      unique.push(trimmed)
    }
  }
  return unique
}
