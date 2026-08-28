import type { TuiAgent } from '@yiru/runtime-protocol/model/agent'

import type { AgentProvider } from './provider'

const PROVIDERS: readonly AgentProvider[] = [
  provider('claude', 'Claude Code', ['claude'], true),
  provider('claude-agent-teams', 'Claude Code Agent Teams', ['claude'], false),
  provider('openclaude', 'OpenClaude', ['openclaude'], false),
  provider('codex', 'OpenAI Codex', ['codex'], true),
  provider('autohand', 'Autohand', ['autohand'], false),
  provider('opencode', 'OpenCode', ['opencode'], true),
  provider('mimo-code', 'Mimo Code', ['mimo'], true),
  provider('pi', 'Pi', ['pi'], true),
  provider('omp', 'OMP', ['omp'], true),
  provider('gemini', 'Gemini CLI', ['gemini'], true),
  provider('antigravity', 'Antigravity', ['agy', 'antigravity'], true),
  provider('aider', 'Aider', ['aider'], false),
  provider('goose', 'Goose', ['goose'], false),
  provider('amp', 'Amp', ['amp'], false),
  provider('kilo', 'Kilocode', ['kilo'], false),
  provider('kiro', 'Kiro', ['kiro-cli', 'kiro'], false),
  provider('crush', 'Crush', ['crush'], false),
  provider('aug', 'Auggie', ['auggie', 'aug'], false),
  provider('cline', 'Cline', ['cline'], false),
  provider('codebuff', 'Codebuff', ['codebuff'], false),
  provider('command-code', 'Command Code', ['command-code'], false),
  provider('continue', 'Continue', ['cn', 'continue'], false),
  provider('cursor', 'Cursor Agent', ['cursor-agent', 'cursor'], false),
  provider('droid', 'Factory Droid', ['droid'], true),
  provider('kimi', 'Kimi', ['kimi'], false),
  provider('mistral-vibe', 'Mistral Vibe', ['vibe'], false),
  provider('qwen-code', 'Qwen Code', ['qwen', 'qwen-code'], false),
  provider('rovo', 'Rovo Dev', ['acli', 'rovo'], false),
  provider('hermes', 'Hermes Agent', ['hermes'], false),
  provider('openclaw', 'OpenClaw', ['openclaw'], false),
  provider('copilot', 'GitHub Copilot CLI', ['copilot'], false),
  provider('grok', 'Grok CLI', ['grok'], true),
  provider('devin', 'Devin CLI', ['devin'], true),
  provider('ante', 'Ante', ['ante'], false),
  provider('trae', 'Trae', ['trae'], false)
]

const PROVIDERS_BY_ID = new Map(PROVIDERS.map((entry) => [entry.id, entry]))

export function listAgentProviders(): readonly AgentProvider[] {
  return PROVIDERS
}

export function getAgentProvider(agent: TuiAgent): AgentProvider {
  const provider = PROVIDERS_BY_ID.get(agent)
  if (!provider) {
    throw new Error('agent_provider_unknown')
  }
  return provider
}

function provider(
  id: TuiAgent,
  label: string,
  executableCandidates: readonly string[],
  resumable: boolean
): AgentProvider {
  return { executableCandidates, id, label, resumable }
}
