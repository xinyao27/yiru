import { FolderOpen, ArrowSquareOut as ExternalLink } from '@phosphor-icons/react'
import React, { useCallback } from 'react'

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { getLocalFileManagerLabel } from '@/lib/local-file-manager-label'
import { OpenInApplicationIcon } from '@/lib/open-in-app-catalog'
import { useAppStore } from '@/store'

import type { OpenInApplication, OpenInTargetKey } from '../../../../shared/types'
import { useRuntimeRemoteSshSupport } from './use-runtime-remote-ssh-support'
import { getOpenInEntryAvailability, openWorktreePath } from './worktree-path-opening'

export { getLocalFileManagerLabel } from '@/lib/local-file-manager-label'
export { openWorktreePath } from './worktree-path-opening'

type WorktreeOpenInMenuItemsProps = {
  worktreePath: string
  connectionId?: string | null
  runtimeEnvironmentId?: string | null
  disabled?: boolean
  labelPrefix?: string
  onEntryOpen?: (entry: OpenInMenuEntry) => void
}

export type OpenInMenuEntry = {
  id: string
  preferenceKey: OpenInTargetKey
  label: string
  target: 'external-editor' | 'file-manager'
  command?: string
}

export function getWorktreeOpenInEntries(
  openInApplications: OpenInApplication[],
  fileManagerLabel: string
): OpenInMenuEntry[] {
  return [
    ...openInApplications.map((application) => ({
      id: application.id,
      preferenceKey: `application:${application.id}` as const,
      label: application.label,
      target: 'external-editor' as const,
      command: application.command
    })),
    {
      id: 'file-manager',
      preferenceKey: 'file-manager',
      label: fileManagerLabel,
      target: 'file-manager'
    }
  ]
}

export function getPreferredWorktreeOpenInEntry(
  entries: readonly OpenInMenuEntry[],
  preferredKey: OpenInTargetKey | null | undefined
): OpenInMenuEntry | null {
  return entries.find((entry) => entry.preferenceKey === preferredKey) ?? entries[0] ?? null
}

function stopMenuPropagation(event: React.SyntheticEvent): void {
  event.stopPropagation()
}

export function openOpenInAppsSettings(): void {
  const store = useAppStore.getState()
  store.openSettingsTarget({
    pane: 'general',
    repoId: null,
    sectionId: 'general-open-in-apps'
  })
  store.openSettingsPage()
}

function useOpenInWorktreePath({
  worktreePath,
  connectionId,
  runtimeEnvironmentId
}: WorktreeOpenInMenuItemsProps): (
  target: 'file-manager' | 'external-editor',
  command?: string
) => Promise<void> {
  return useCallback(
    async (target, command) => {
      await openWorktreePath({
        target,
        worktreePath,
        connectionId,
        runtimeEnvironmentId,
        command
      })
    },
    [connectionId, runtimeEnvironmentId, worktreePath]
  )
}

export function WorktreeOpenInMenuItems({
  worktreePath,
  connectionId,
  runtimeEnvironmentId,
  disabled,
  labelPrefix = '',
  onEntryOpen
}: WorktreeOpenInMenuItemsProps): React.JSX.Element {
  const openInWorktreePath = useOpenInWorktreePath({
    worktreePath,
    connectionId,
    runtimeEnvironmentId
  })
  const openInApplications = useAppStore((s) => s.settings?.openInApplications ?? [])
  const fileManagerLabel = getLocalFileManagerLabel()
  const entries = getWorktreeOpenInEntries(openInApplications, fileManagerLabel)
  const runtimeRemoteSshSupport = useRuntimeRemoteSshSupport(runtimeEnvironmentId, connectionId)

  return (
    <>
      {entries.map((entry) => {
        const availability = getOpenInEntryAvailability(entry, {
          connectionId,
          runtimeEnvironmentId,
          runtimeRemoteSshSupport
        })
        return (
          <DropdownMenuItem
            key={entry.preferenceKey}
            onClick={(event) => {
              stopMenuPropagation(event)
              onEntryOpen?.(entry)
              void openInWorktreePath(entry.target, entry.command)
            }}
            disabled={disabled || availability.disabled}
          >
            {entry.target === 'file-manager' ? (
              <FolderOpen className="size-3.5" />
            ) : entry.command ? (
              <OpenInApplicationIcon application={{ command: entry.command }} size={14} />
            ) : (
              <ExternalLink weight="regular" className="size-3.5" />
            )}
            <span className="min-w-0 truncate">
              {labelPrefix}
              {entry.label}
            </span>
            {availability.metadata ? (
              <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                {availability.metadata}
              </span>
            ) : null}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

export function WorktreeOpenInMenuContent({
  worktreePath,
  connectionId,
  runtimeEnvironmentId,
  disabled,
  onEntryOpen
}: WorktreeOpenInMenuItemsProps): React.JSX.Element {
  return (
    <>
      <WorktreeOpenInMenuItems
        worktreePath={worktreePath}
        connectionId={connectionId}
        runtimeEnvironmentId={runtimeEnvironmentId}
        disabled={disabled}
        onEntryOpen={onEntryOpen}
      />
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={(event) => {
          stopMenuPropagation(event)
          openOpenInAppsSettings()
        }}
        disabled={disabled}
      >
        {translate('auto.components.sidebar.WorktreeOpenInMenu.1417fd8380', 'Customize apps...')}
      </DropdownMenuItem>
    </>
  )
}

export function WorktreeOpenInSubMenu({
  worktreePath,
  connectionId,
  runtimeEnvironmentId,
  disabled,
  onEntryOpen
}: WorktreeOpenInMenuItemsProps): React.JSX.Element {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled}>
        <FolderOpen className="size-3.5" />
        {translate('auto.components.sidebar.WorktreeOpenInMenu.8009ab69a6', 'Open in')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-52"
        onClick={stopMenuPropagation}
        onPointerDown={stopMenuPropagation}
      >
        <WorktreeOpenInMenuContent
          worktreePath={worktreePath}
          connectionId={connectionId}
          runtimeEnvironmentId={runtimeEnvironmentId}
          disabled={disabled}
          onEntryOpen={onEntryOpen}
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
