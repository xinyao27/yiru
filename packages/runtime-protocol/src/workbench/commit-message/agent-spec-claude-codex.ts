import type { TuiAgent } from '../types'
import { CLAUDE_THINKING_LEVELS, OPENAI_THINKING_LEVELS } from './agent-model-metadata'
import { parseCodexModels } from './agent-model-parsers'
import type { CommitMessageAgentSpec } from './agent-spec-types'

export const CLAUDE_CODEX_COMMIT_MESSAGE_SPECS: Partial<Record<TuiAgent, CommitMessageAgentSpec>> =
  {
    claude: {
      id: 'claude',
      label: 'Claude',
      binary: 'claude',
      // Why: diffs can be large and Claude reads stdin when no positional prompt exists.
      promptDelivery: 'stdin',
      buildArgs: ({ model, thinkingLevel }) => [
        '-p',
        '--output-format',
        'text',
        '--model',
        model,
        '--permission-mode',
        'plan',
        ...(thinkingLevel ? ['--effort', thinkingLevel] : [])
      ],
      modelSource: 'static',
      models: [
        { id: 'haiku', label: 'Haiku' },
        {
          id: 'sonnet',
          label: 'Sonnet',
          thinkingLevels: CLAUDE_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        },
        {
          id: 'opus',
          label: 'Opus',
          thinkingLevels: CLAUDE_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        }
      ],
      defaultModelId: 'sonnet'
    },
    codex: {
      id: 'codex',
      label: 'Codex',
      binary: 'codex',
      // Why: commit prompts exceed argv limits; codex exec reads stdin without a prompt arg.
      promptDelivery: 'stdin',
      buildArgs: ({ model, thinkingLevel }) => [
        'exec',
        '--ephemeral',
        '--skip-git-repo-check',
        '-s',
        'read-only',
        '--model',
        model,
        ...(thinkingLevel ? ['-c', `model_reasoning_effort=${thinkingLevel}`] : [])
      ],
      modelSource: 'dynamic',
      modelDiscovery: { binary: 'codex', args: ['debug', 'models'], parse: parseCodexModels },
      models: [
        {
          id: 'gpt-5.5',
          label: 'GPT-5.5',
          thinkingLevels: OPENAI_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        },
        {
          id: 'gpt-5.4',
          label: 'GPT-5.4',
          thinkingLevels: OPENAI_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        },
        {
          id: 'gpt-5.4-mini',
          label: 'GPT-5.4 Mini',
          thinkingLevels: OPENAI_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        },
        {
          id: 'gpt-5.3-codex',
          label: 'GPT-5.3 Codex',
          thinkingLevels: OPENAI_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        },
        {
          id: 'gpt-5.3-codex-spark',
          label: 'GPT-5.3 Codex Spark',
          thinkingLevels: OPENAI_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        },
        {
          id: 'gpt-5.2',
          label: 'GPT-5.2',
          thinkingLevels: OPENAI_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        }
      ],
      defaultModelId: 'gpt-5.5'
    }
  }
