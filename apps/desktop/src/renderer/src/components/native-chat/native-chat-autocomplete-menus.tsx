import { ArrowClockwise, Package } from '@phosphor-icons/react'
import { memo, useEffect, useRef } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { SkillSourceKind } from '../../../../shared/skills'
import type { ComposerAutocomplete, NativeChatPickerItem } from './native-chat-composer-state'

export const NativeChatPickerMenu = memo(function NativeChatPickerMenu({
  autocomplete,
  activeIndex,
  listboxId,
  onChoose,
  onRetry
}: {
  autocomplete: Extract<ComposerAutocomplete, { mode: 'slash' | 'skill' }>
  activeIndex: number
  listboxId: string
  onChoose: (item: NativeChatPickerItem) => void
  onRetry: () => void
}): React.JSX.Element {
  const activeItemRef = useRef<HTMLElement | null>(null)
  const commands = autocomplete.items.filter(
    (item): item is Extract<NativeChatPickerItem, { kind: 'command' }> => item.kind === 'command'
  )
  const skills = autocomplete.items.filter(
    (item): item is Extract<NativeChatPickerItem, { kind: 'skill' }> => item.kind === 'skill'
  )

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, autocomplete.items])

  const hasSkillStatus =
    autocomplete.skillStatus === 'loading' || autocomplete.skillStatus === 'error'
  const showCommandsHeading = autocomplete.grouped && commands.length > 0
  const showSkillsHeading = autocomplete.grouped && (skills.length > 0 || hasSkillStatus)
  const noMatches =
    autocomplete.skillStatus === 'ready' && commands.length === 0 && skills.length === 0
  const emptyText = noMatches ? getPickerEmptyText(autocomplete) : null
  const collision = commands.find((item) => item.skillCollision)
  const duplicate = skills.find((item) => item.sources.length > 1)

  let optionIndex = 0
  return (
    <div
      id={listboxId}
      role="listbox"
      className="scrollbar-sleek border-border bg-popover text-popover-foreground absolute right-0 bottom-full left-0 z-20 mb-1 max-h-72 overflow-y-auto border p-1"
    >
      {showCommandsHeading ? <PickerGroupHeading kind="commands" /> : null}
      {commands.map((item) => {
        const index = optionIndex++
        return (
          <PickerOption
            key={item.id}
            item={item}
            prefix={autocomplete.prefix}
            index={index}
            activeIndex={activeIndex}
            listboxId={listboxId}
            activeItemRef={activeItemRef}
            onChoose={onChoose}
          />
        )
      })}
      {showSkillsHeading ? <PickerGroupHeading kind="skills" /> : null}
      {autocomplete.skillStatus === 'loading' ? (
        <PickerStatus>
          <LoadingIndicator className="size-3.5" />
          {translate('components.native-chat.composer.loadingSkills', 'Loading skills...')}
        </PickerStatus>
      ) : null}
      {autocomplete.skillStatus === 'error' ? (
        <PickerStatus>
          <span className="min-w-0 flex-1">
            {autocomplete.skillErrorKind === 'unavailable'
              ? translate(
                  'components.native-chat.composer.skillsUnavailableHost',
                  'Skills are unavailable for this host'
                )
              : translate(
                  'components.native-chat.composer.skillsLoadFailed',
                  'Could not load skills from this host'
                )}
          </span>
          {autocomplete.skillErrorKind !== 'unavailable' ? (
            <Button
              variant="quiet"
              size="xs"
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={onRetry}
            >
              <ArrowClockwise className="size-3" />
              {translate('components.native-chat.composer.retrySkills', 'Retry')}
            </Button>
          ) : null}
        </PickerStatus>
      ) : null}
      {skills.map((item) => {
        const index = optionIndex++
        return (
          <PickerOption
            key={item.id}
            item={item}
            prefix={autocomplete.prefix}
            index={index}
            activeIndex={activeIndex}
            listboxId={listboxId}
            activeItemRef={activeItemRef}
            onChoose={onChoose}
          />
        )
      })}
      {noMatches ? <PickerStatus>{emptyText}</PickerStatus> : null}
      <div aria-live="polite" className="sr-only">
        {autocomplete.skillStatus === 'loading'
          ? translate('components.native-chat.composer.loadingSkills', 'Loading skills...')
          : autocomplete.skillStatus === 'error'
            ? translate(
                'components.native-chat.composer.skillsLoadFailed',
                'Could not load skills from this host'
              )
            : emptyText
              ? emptyText
              : autocomplete.skillsEnabled
                ? [
                    translate('components.native-chat.composer.skillsLoaded', 'Skills loaded'),
                    collision
                      ? getPickerAnnotation(collision)
                      : duplicate
                        ? getPickerAnnotation(duplicate)
                        : null
                  ]
                    .filter(Boolean)
                    .join('. ')
                : ''}
      </div>
    </div>
  )
})

function getPickerEmptyText(
  autocomplete: Extract<ComposerAutocomplete, { mode: 'slash' | 'skill' }>
): string {
  if (autocomplete.mode === 'skill' || !autocomplete.commandsEnabled) {
    return translate('components.native-chat.composer.noSkills', 'No matching skills')
  }
  if (autocomplete.skillsEnabled) {
    return translate(
      'components.native-chat.composer.noCommandsOrSkills',
      'No matching commands or skills'
    )
  }
  return translate('components.native-chat.composer.noCommands', 'No matching commands')
}

function PickerGroupHeading({ kind }: { kind: 'commands' | 'skills' }): React.JSX.Element {
  return (
    <div className="text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-semibold tracking-wide uppercase">
      {kind === 'commands'
        ? translate('components.native-chat.composer.commands', 'Commands')
        : translate('components.native-chat.composer.skills', 'Skills')}
    </div>
  )
}

function PickerStatus({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-xs">
      {children}
    </div>
  )
}

function PickerOption({
  item,
  prefix,
  index,
  activeIndex,
  listboxId,
  activeItemRef,
  onChoose
}: {
  item: NativeChatPickerItem
  prefix: '/' | '$'
  index: number
  activeIndex: number
  listboxId: string
  activeItemRef: React.MutableRefObject<HTMLElement | null>
  onChoose: (item: NativeChatPickerItem) => void
}): React.JSX.Element {
  const annotation = getPickerAnnotation(item)
  const selected = index === activeIndex
  return (
    <Button
      variant="ghost"
      size="list-row"
      id={`${listboxId}-option-${index}`}
      ref={selected ? activeItemRef : null}
      role="option"
      aria-selected={selected}
      type="button"
      onPointerDown={(event) => {
        // Why: the textarea owns query and caret state, so pointer acceptance
        // must run before the browser transfers focus to this row.
        event.preventDefault()
        onChoose(item)
      }}
      className={cn(
        'w-full items-start justify-start gap-2 border-transparent px-2 py-1.5 text-left text-sm font-normal whitespace-normal',
        selected && 'border-border bg-accent text-accent-foreground'
      )}
    >
      {item.kind === 'skill' ? (
        <Package className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono font-medium">{prefix + item.name}</span>
        {item.description ? (
          <span className="text-muted-foreground block truncate text-xs">{item.description}</span>
        ) : null}
        {annotation ? (
          <span className="text-muted-foreground block truncate text-xs">{annotation}</span>
        ) : null}
      </span>
      {item.kind === 'skill' ? (
        <span className="text-muted-foreground shrink-0 pt-0.5 text-xs">
          {scopeLabel(item.sources[0]?.sourceKind)}
        </span>
      ) : null}
    </Button>
  )
}

function getPickerAnnotation(item: NativeChatPickerItem): string | null {
  if (item.kind === 'command' && item.skillCollision) {
    return translate(
      'components.native-chat.composer.skillCommandCollision',
      'Also a skill name - agent decides'
    )
  }
  if (item.kind === 'skill' && item.sources.length > 1) {
    // Why: name the interpolation `sourceCount`, not `count` — a `count` option
    // makes i18next resolve plural-suffixed keys that these locales don't define.
    return translate(
      'components.native-chat.composer.skillMultipleSources',
      '{{sourceCount}} sources - agent resolves',
      { sourceCount: item.sources.length }
    )
  }
  return null
}

function scopeLabel(sourceKind: SkillSourceKind | undefined): string {
  const labels: Record<string, string> = {
    repo: translate('components.native-chat.composer.skillScopeProject', 'Project'),
    home: translate('components.native-chat.composer.skillScopePersonal', 'Personal'),
    bundled: translate('components.native-chat.composer.skillScopeBuiltIn', 'Built-in'),
    plugin: translate('components.native-chat.composer.skillScopePlugin', 'Plugin')
  }
  return sourceKind ? (labels[sourceKind] ?? '') : ''
}

export function NativeChatMentionHint({
  query,
  onAccept
}: {
  query: string
  onAccept: () => void
}): React.JSX.Element {
  return (
    <Button
      variant="outline"
      size="xs"
      type="button"
      onPointerDown={(event) => {
        event.preventDefault()
        onAccept()
      }}
      className="bg-popover text-muted-foreground absolute right-3 bottom-full left-3 mb-1 flex h-auto w-auto items-center gap-2 px-3 py-1.5 text-left sm:right-4 sm:left-4"
    >
      {translate('components.native-chat.composer.mentionHint', 'Referencing file:')}{' '}
      <span className="text-foreground font-medium">@{query || '…'}</span>
    </Button>
  )
}
