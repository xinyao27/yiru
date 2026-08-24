import type { TuiAgent } from '../types'
import { BASIC_THINKING_LEVELS, withOpenAiThinking } from './agent-model-metadata'
import {
  parseAntigravityModels,
  parseCursorModels,
  parseLineModels,
  parsePiModels
} from './agent-model-parsers'
import type { CommitMessageAgentSpec } from './agent-spec-types'

export const OTHER_COMMIT_MESSAGE_AGENT_SPECS: Partial<Record<TuiAgent, CommitMessageAgentSpec>> = {
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    binary: 'opencode',
    promptDelivery: 'stdin',
    buildArgs: ({ model, thinkingLevel }) => [
      'run',
      '--model',
      model,
      '--agent',
      'build',
      '--format',
      'default',
      ...(thinkingLevel ? ['--variant', thinkingLevel] : [])
    ],
    modelSource: 'dynamic',
    modelDiscovery: { binary: 'opencode', args: ['models'], parse: parseLineModels },
    models: [
      {
        id: 'opencode/deepseek-v4-flash-free',
        label: 'OpenCode DeepSeek V4 Flash Free'
      },
      {
        id: 'opencode/gpt-5.4-mini',
        label: 'OpenCode GPT 5.4 Mini',
        ...withOpenAiThinking('gpt-5.4-mini')
      }
    ],
    defaultModelId: 'opencode/deepseek-v4-flash-free'
  },
  pi: {
    id: 'pi',
    label: 'Pi',
    binary: 'pi',
    promptDelivery: 'stdin',
    buildArgs: ({ model, thinkingLevel }) => [
      '--print',
      '--no-session',
      '--no-tools',
      '--no-extensions',
      '--no-skills',
      '--no-context-files',
      '--mode',
      'text',
      ...(model ? ['--model', model] : []),
      ...(thinkingLevel ? ['--thinking', thinkingLevel] : [])
    ],
    modelSource: 'dynamic',
    modelDiscovery: { binary: 'pi', args: ['--list-models'], parse: parsePiModels },
    models: [
      {
        id: 'github-copilot/gpt-5.4-mini',
        label: 'Github Copilot GPT 5.4 Mini',
        ...withOpenAiThinking('gpt-5.4-mini')
      }
    ],
    defaultModelId: 'github-copilot/gpt-5.4-mini'
  },
  amp: {
    id: 'amp',
    label: 'Amp',
    binary: 'amp',
    promptDelivery: 'stdin',
    buildArgs: ({ model, thinkingLevel }) => [
      '--execute',
      '--no-notifications',
      '--no-ide',
      '--no-jetbrains',
      '--mode',
      model,
      ...(thinkingLevel ? ['--effort', thinkingLevel] : [])
    ],
    modelSource: 'static',
    models: [
      { id: 'smart', label: 'Smart' },
      { id: 'rush', label: 'Rush' },
      {
        id: 'large',
        label: 'Large',
        thinkingLevels: BASIC_THINKING_LEVELS,
        defaultThinkingLevel: 'low'
      },
      {
        id: 'deep',
        label: 'Deep',
        thinkingLevels: BASIC_THINKING_LEVELS,
        defaultThinkingLevel: 'low'
      }
    ],
    defaultModelId: 'smart'
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    binary: 'cursor-agent',
    promptDelivery: 'argv',
    buildArgs: ({ prompt, model }) => [
      '--print',
      '--mode',
      'ask',
      '--trust',
      '--output-format',
      'text',
      '--model',
      model,
      prompt
    ],
    modelSource: 'dynamic',
    modelDiscovery: { binary: 'cursor-agent', args: ['--list-models'], parse: parseCursorModels },
    models: [{ id: 'auto', label: 'Auto' }],
    defaultModelId: 'auto'
  },
  kimi: {
    id: 'kimi',
    label: 'Kimi',
    binary: 'kimi',
    promptDelivery: 'stdin',
    buildArgs: ({ model, thinkingLevel }) => [
      '--print',
      '--quiet',
      ...(model && model !== 'default' ? ['--model', model] : []),
      ...(thinkingLevel === 'on'
        ? ['--thinking']
        : thinkingLevel === 'off'
          ? ['--no-thinking']
          : [])
    ],
    modelSource: 'static',
    models: [
      { id: 'default', label: 'Config default' },
      {
        id: 'kimi-code/kimi-for-coding',
        label: 'Kimi K2.6',
        thinkingLevels: [
          { id: 'on', label: 'On' },
          { id: 'off', label: 'Off' }
        ],
        defaultThinkingLevel: 'on'
      }
    ],
    defaultModelId: 'default'
  },
  antigravity: {
    id: 'antigravity',
    label: 'Antigravity',
    binary: 'agy',
    promptDelivery: 'stdin',
    buildArgs: ({ model }) => ['--print', '--sandbox', '--model', model],
    modelSource: 'dynamic',
    modelDiscovery: { binary: 'agy', args: ['models'], parse: parseAntigravityModels },
    models: [
      { id: 'Gemini 3.5 Flash (Medium)', label: 'Gemini 3.5 Flash (Medium)' },
      { id: 'Gemini 3.5 Flash (High)', label: 'Gemini 3.5 Flash (High)' },
      { id: 'Gemini 3.5 Flash (Low)', label: 'Gemini 3.5 Flash (Low)' }
    ],
    defaultModelId: 'Gemini 3.5 Flash (Medium)'
  }
}
