import type { PRInfo } from '@yiru/workbench-model/review'
import * as Clipboard from 'expo-clipboard'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'

import { FileX as FileWarning } from '@/components/uniwind-icons'

import { MobileGlassTextButton } from '../glass/text-button'
import { prAiTriageStyles as triageStyles } from './pr-ai-triage-styles'
import { resolveConflictDisplay } from './pr-conflict-presentation'
import { PRSection } from './pr-section'

// Launches the "Resolve conflicts with AI" agent. Absent for display-only usages.
export type PrConflictsTriage = {
  resolveConflicts: () => void
  isBusy: boolean
  error: string | null
}

type Props = {
  pr: PRInfo
  // True while a refresh is in flight, so the fallback notice can explain that
  // missing conflict file details may still be loading (desktop parity).
  isRefreshing?: boolean
  triage?: PrConflictsTriage
}

// Conflicting-files section — shown only when the hosted review reports merge
// conflicts. Lists the conflicting file paths, or a fallback notice when the file
// list is not yet available. Ports the desktop ConflictingFilesSection +
// MergeConflictNotice into the mobile card shell.
export function PRConflictingFilesSection({ pr, isRefreshing = false, triage }: Props) {
  const [commandsCopied, setCommandsCopied] = useState(false)
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const conflict = resolveConflictDisplay(pr)

  useEffect(() => {
    return () => {
      if (copiedResetTimerRef.current) {
        clearTimeout(copiedResetTimerRef.current)
      }
    }
  }, [])

  if (!conflict) {
    return null
  }
  let noticeBody = 'Conflict file details are unavailable'
  if (isRefreshing) {
    noticeBody = 'Refreshing conflict details…'
  } else if (conflict.localMergeClean) {
    noticeBody =
      'GitHub reports conflicts, but local Git did not reproduce them. Refresh the PR or push the branch to recalculate mergeability.'
  }

  const copyRefreshCommands = async () => {
    if (!conflict.mergeabilityRefreshCommands) {
      return
    }
    try {
      await Clipboard.setStringAsync(conflict.mergeabilityRefreshCommands)
    } catch {
      return
    }
    if (copiedResetTimerRef.current) {
      clearTimeout(copiedResetTimerRef.current)
    }
    setCommandsCopied(true)
    copiedResetTimerRef.current = setTimeout(() => {
      copiedResetTimerRef.current = null
      setCommandsCopied(false)
    }, 1500)
  }

  return (
    <PRSection title="Conflicts">
      {conflict.commitsBehind !== null && conflict.baseCommit !== null ? (
        <Text className="text-muted-foreground text-xs">
          {conflict.commitsBehind} commit{conflict.commitsBehind === 1 ? '' : 's'} behind (base
          commit:{' '}
          <Text className="text-muted-foreground font-mono text-xs">{conflict.baseCommit}</Text>)
        </Text>
      ) : null}

      {conflict.fileDetailsUnavailable ? (
        <View>
          <Text className="text-foreground text-xs font-semibold">
            This branch has conflicts that must be resolved
          </Text>
          <Text className="text-muted-foreground mt-1 text-xs">{noticeBody}</Text>
          {conflict.mergeabilityRefreshCommands ? (
            <View className="border-hairline border-border bg-secondary mt-2 rounded-xl p-2">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="text-muted-foreground text-xs font-semibold">
                  Run from this worktree
                </Text>
                <MobileGlassTextButton
                  accessibilityLabel="Copy mergeability refresh commands"
                  label={commandsCopied ? 'Copied' : 'Copy commands'}
                  onPress={() => void copyRefreshCommands()}
                  size="small"
                />
              </View>
              <Text selectable className="text-foreground mt-2 font-mono text-xs leading-4">
                {conflict.mergeabilityRefreshCommands}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View>
          <View className="mt-2 flex-row items-center gap-2">
            <FileWarning size={14} colorClassName="accent-muted-foreground" />
            <Text className="text-muted-foreground text-xs">Conflicting files</Text>
          </View>
          <ScrollView
            className="mt-2 max-h-44"
            contentContainerClassName="gap-1"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {conflict.files.map((filePath) => (
              <View
                key={filePath}
                className="border-hairline border-border bg-secondary rounded-lg px-2 py-1"
              >
                <Text className="text-foreground font-mono text-xs">{filePath}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* "Resolve conflicts with AI" — mirrors desktop's PRTriageStrip. Launches an
          agent that brings the base branch in and completes the merge. */}
      {triage ? (
        <View className="gap-1">
          <MobileGlassTextButton
            accessibilityLabel="Resolve conflicts with AI"
            disabled={triage.isBusy}
            isFullWidth
            label={triage.isBusy ? 'Resolving…' : 'Resolve conflicts with AI'}
            onPress={triage.resolveConflicts}
            size="regular"
          />
          {triage.error ? <Text className={triageStyles.triageError}>{triage.error}</Text> : null}
        </View>
      ) : null}
    </PRSection>
  )
}
