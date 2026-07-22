import { useEffect, useRef } from 'react'

import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { DiscoveredSkill } from '../../../../shared/skills'
import type { SlashCommandSuggestion } from './native-chat-composer-state'

export function NativeChatSlashMenu({
  suggestions,
  activeIndex,
  onChoose
}: {
  suggestions: SlashCommandSuggestion[]
  activeIndex: number
  onChoose: (command: SlashCommandSuggestion) => void
}): React.JSX.Element {
  return (
    <div className="border-border bg-popover absolute right-3 bottom-full left-3 mb-1 overflow-hidden rounded-md border sm:right-4 sm:left-4">
      {suggestions.map((command, index) => (
        <button
          key={command.name}
          type="button"
          onClick={() => onChoose(command)}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
            index === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground'
          )}
        >
          <span className="font-medium">/{command.name}</span>
          {command.description ? (
            <span className="text-muted-foreground truncate text-xs">{command.description}</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

export function NativeChatMentionHint({
  query,
  onAccept
}: {
  query: string
  onAccept: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onAccept}
      className="border-border bg-popover text-muted-foreground absolute right-3 bottom-full left-3 mb-1 flex w-auto items-center gap-2 rounded-md border px-3 py-1.5 text-left text-xs sm:right-4 sm:left-4"
    >
      {translate('components.native-chat.composer.mentionHint', 'Referencing file:')}{' '}
      <span className="text-foreground font-medium">@{query || '…'}</span>
    </button>
  )
}

export function NativeChatSkillMenu({
  suggestions,
  activeIndex,
  onChoose
}: {
  suggestions: DiscoveredSkill[]
  activeIndex: number
  onChoose: (skill: DiscoveredSkill) => void
}): React.JSX.Element {
  const activeItemRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, suggestions])

  return (
    <div className="scrollbar-sleek border-border bg-popover absolute right-0 bottom-full left-0 mb-1 max-h-64 overflow-y-auto rounded-md border p-1">
      {suggestions.length === 0 ? (
        <div className="text-muted-foreground px-2 py-1.5 text-xs">
          {translate('components.native-chat.composer.noSkills', 'No matching skills')}
        </div>
      ) : null}
      {suggestions.map((skill, index) => (
        <button
          key={skill.id}
          ref={index === activeIndex ? activeItemRef : null}
          type="button"
          onClick={() => onChoose(skill)}
          className={cn(
            'flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
            index === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground'
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">${skill.name}</span>
            {skill.description ? (
              <span className="text-muted-foreground block truncate text-xs">
                {skill.description}
              </span>
            ) : null}
          </span>
          <span className="text-muted-foreground shrink-0 text-[11px]">{skill.sourceLabel}</span>
        </button>
      ))}
    </div>
  )
}
