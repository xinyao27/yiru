import type { TuiAgent } from '../types'
import { OPENAI_THINKING_LEVELS } from './agent-model-metadata'
import type { CommitMessageAgentSpec, CommitMessageModel } from './agent-spec-types'

const OPENAI_COPILOT_MODELS: CommitMessageModel[] = [
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { id: 'gpt-5.2', label: 'GPT-5.2' },
  { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { id: 'gpt-5.4', label: 'GPT-5.4' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { id: 'gpt-5.5', label: 'GPT-5.5' }
].map((model) =>
  model.id === 'gpt-4.1'
    ? model
    : {
        ...model,
        thinkingLevels: OPENAI_THINKING_LEVELS,
        defaultThinkingLevel: 'low'
      }
)

export const COPILOT_COMMIT_MESSAGE_SPECS: Partial<Record<TuiAgent, CommitMessageAgentSpec>> = {
  copilot: {
    id: 'copilot',
    label: 'GitHub Copilot',
    binary: 'copilot',
    promptDelivery: 'argv',
    buildArgs: ({ prompt, model, thinkingLevel }) => [
      '--prompt',
      prompt,
      '--silent',
      '--stream',
      'off',
      '--no-custom-instructions',
      '--model',
      model,
      ...(thinkingLevel ? ['--effort', thinkingLevel] : [])
    ],
    modelSource: 'static',
    // Why: the CLI picker is policy-filtered per account; this catalog lets
    // users select any hosted model their organization enables.
    models: [
      { id: 'auto', label: 'Auto' },
      { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
      { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
      { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4.5', label: 'Claude Opus 4.5' },
      { id: 'claude-opus-4.6', label: 'Claude Opus 4.6' },
      { id: 'claude-opus-4.6-fast', label: 'Claude Opus 4.6 Fast' },
      { id: 'claude-opus-4.7', label: 'Claude Opus 4.7' },
      ...OPENAI_COPILOT_MODELS
    ],
    defaultModelId: 'gpt-5.4'
  }
}
