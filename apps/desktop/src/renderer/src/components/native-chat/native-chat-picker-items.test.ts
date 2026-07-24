import { describe, expect, it } from 'vite-plus/test'

import { getNativeChatAgentProfile } from '../../../../shared/native-chat-agent-profiles'
import type { DiscoveredSkill } from '../../../../shared/skills'
import {
  applyPickerSuggestion,
  buildNativeChatPickerItems,
  classifyNativeChatSend,
  deriveComposerAutocomplete,
  editReplacesTriggerToken,
  type SlashCommandSuggestion
} from './native-chat-composer-state'

const COMMANDS: SlashCommandSuggestion[] = [
  { name: 'clear' },
  { name: 'compact' },
  { name: 'help' }
]

function skill(overrides: Partial<DiscoveredSkill>): DiscoveredSkill {
  return {
    id: overrides.name ?? 'skill',
    name: 'typescript',
    description: null,
    providers: ['codex'],
    sourceKind: 'repo',
    sourceLabel: 'Repository',
    rootPath: '/repo/.agents/skills',
    directoryPath: '/repo/.agents/skills/typescript',
    skillFilePath: '/repo/.agents/skills/typescript/SKILL.md',
    installed: true,
    fileCount: 1,
    updatedAt: null,
    ...overrides
  }
}

describe('native skill and command picker', () => {
  it('keeps Codex commands under slash and skills under dollar', () => {
    const profile = getNativeChatAgentProfile('codex')
    const slash = deriveComposerAutocomplete('/', 1, COMMANDS, [skill({})], profile)
    expect(slash.mode).toBe('slash')
    if (slash.mode === 'slash') {
      expect(slash.items.every((item) => item.kind === 'command')).toBe(true)
    }
    const dollar = deriveComposerAutocomplete('$', 1, COMMANDS, [skill({})], profile)
    expect(dollar.mode).toBe('skill')
    if (dollar.mode === 'skill') {
      expect(dollar.items.every((item) => item.kind === 'skill')).toBe(true)
    }
  })

  it('groups Claude commands and skills under slash', () => {
    const result = deriveComposerAutocomplete(
      '/',
      1,
      COMMANDS,
      [skill({ name: 'browser' })],
      getNativeChatAgentProfile('claude')
    )
    expect(result.mode).toBe('slash')
    if (result.mode === 'slash') {
      expect(result.grouped).toBe(true)
      expect(result.items.map((item) => item.kind)).toContain('command')
      expect(result.items.map((item) => item.kind)).toContain('skill')
    }
  })

  it('ranks exact, prefix, fuzzy, then description matches within a group', () => {
    const descriptionMatch = 'Deploy an application'
    const items = buildNativeChatPickerItems(
      [],
      [
        skill({ name: 'deploy', skillFilePath: '/1/SKILL.md' }),
        skill({ name: 'deployment', skillFilePath: '/2/SKILL.md' }),
        skill({ name: 'd-e-p-l-o-y', skillFilePath: '/3/SKILL.md' }),
        skill({
          name: 'release',
          description: descriptionMatch,
          skillFilePath: '/4/SKILL.md'
        })
      ],
      'deploy',
      '$'
    )
    expect(items.map((item) => item.name)).toEqual([
      'deploy',
      'deployment',
      'd-e-p-l-o-y',
      'release'
    ])
  })

  it('merges duplicate names but annotates command collisions on one command row', () => {
    const duplicateSkills = [
      skill({ name: 'clear', skillFilePath: '/project/clear/SKILL.md', sourceKind: 'repo' }),
      skill({ name: 'clear', skillFilePath: '/home/clear/SKILL.md', sourceKind: 'home' })
    ]
    const skillOnly = buildNativeChatPickerItems([], duplicateSkills, '', '$')
    expect(skillOnly).toEqual([
      expect.objectContaining({ kind: 'skill', name: 'clear', sources: expect.any(Array) })
    ])
    expect(skillOnly[0].kind === 'skill' ? skillOnly[0].sources : []).toHaveLength(2)

    const collision = buildNativeChatPickerItems(COMMANDS, duplicateSkills, 'clear', '/')
    expect(collision).toEqual([
      expect.objectContaining({ kind: 'command', name: 'clear', skillCollision: true })
    ])
  })

  it('keeps a long token-safe name intact for insertion instead of truncating it', () => {
    const longName = `skill-${'x'.repeat(100)}`
    const items = buildNativeChatPickerItems(
      [],
      [skill({ name: longName, skillFilePath: '/long/SKILL.md' })],
      '',
      '$'
    )
    expect(items.map((item) => item.name)).toEqual([longName])
    const applied = applyPickerSuggestion('$sk', 3, items[0], '$')
    expect(applied.draft).toBe(`$${longName} `)
  })

  it('rejects names carrying zero-width characters instead of inserting them', () => {
    const items = buildNativeChatPickerItems(
      [],
      [
        skill({
          name: 'cle\u200bar',
          directoryPath: '/repo/.agents/skills/safe-dir',
          skillFilePath: '/repo/.agents/skills/safe-dir/SKILL.md'
        })
      ],
      '',
      '$'
    )
    expect(items.map((item) => item.name)).toEqual(['safe-dir'])
  })

  it('falls back to a token-safe directory name and strips unsafe display text', () => {
    const items = buildNativeChatPickerItems(
      [],
      [
        skill({
          name: 'Spoof\u202e Name',
          directoryPath: '/repo/.agents/skills/safe-name',
          skillFilePath: '/repo/.agents/skills/safe-name/SKILL.md'
        })
      ],
      '',
      '$'
    )
    expect(items.map((item) => item.name)).toEqual(['safe-name'])
  })

  it('replaces only the active slash token and preserves text after the caret', () => {
    const result = applyPickerSuggestion(
      '/bro trailing',
      4,
      { kind: 'skill', id: 'skill:browser', name: 'browser', description: null, sources: [] },
      '/'
    )
    expect(result.draft).toBe('/browser  trailing')
    expect(result.caret).toBe('/browser '.length)
  })

  it('classifies sends only from the origin tag and exact command catalog', () => {
    expect(classifyNativeChatSend('/browser do work', COMMANDS, '/browser', '/')).toBe('chat')
    expect(classifyNativeChatSend('/clear', COMMANDS, null, '/')).toBe('command')
    expect(classifyNativeChatSend('/Clear', COMMANDS, null, '/')).toBe('unknown-token')
    expect(classifyNativeChatSend('/usr/bin/python is missing', COMMANDS, null, '/')).toBe(
      'unknown-token'
    )
    expect(classifyNativeChatSend('ordinary prompt', COMMANDS, null, '/')).toBe('chat')
  })

  it('leading whitespace makes a slash draft prose, never a dispatched command', () => {
    expect(classifyNativeChatSend(' /clear', COMMANDS, null, '/')).toBe('chat')
  })

  it('treats a leading $ token as unknown only for the $-prefix (Codex) profile', () => {
    expect(classifyNativeChatSend('$deploy now', COMMANDS, null, '$')).toBe('unknown-token')
    expect(classifyNativeChatSend('$PATH is wrong', COMMANDS, null, '/')).toBe('chat')
    expect(classifyNativeChatSend('$50 is the budget', COMMANDS, null, null)).toBe('chat')
  })

  it('treats a one-edit token swap as a new trigger occurrence', () => {
    expect(editReplacesTriggerToken('/foo', '/bar', '/:0')).toBe(true)
    expect(editReplacesTriggerToken('use $foo', 'use $bar', '$:4')).toBe(true)
  })

  it('keeps suppression while typing or deleting inside the dismissed token', () => {
    expect(editReplacesTriggerToken('/foo', '/food', '/:0')).toBe(false)
    expect(editReplacesTriggerToken('/food', '/foo', '/:0')).toBe(false)
    expect(editReplacesTriggerToken('use $foo now', 'ran $foo now', '$:4')).toBe(false)
  })

  it('suppresses only the dismissed trigger occurrence', () => {
    const profile = getNativeChatAgentProfile('codex')
    expect(deriveComposerAutocomplete('use $bro', 8, COMMANDS, [skill({})], profile).mode).toBe(
      'skill'
    )
    expect(
      deriveComposerAutocomplete(
        'use $bro',
        8,
        COMMANDS,
        [skill({})],
        profile,
        { status: 'ready', skills: [skill({})] },
        '$:4'
      ).mode
    ).toBe('none')
  })
})
