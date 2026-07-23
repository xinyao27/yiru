import type { PRInfo } from '@yiru/workbench-model/review'
import * as Clipboard from 'expo-clipboard'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'

import { Check, Copy, FileX as FileWarning, Sparkle as Sparkles } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { prAiTriageStyles as triageStyles } from './pr-ai-triage-styles'
import { resolveConflictDisplay } from './pr-conflict-presentation'
import { prConflictStyles as styles } from './pr-conflict-styles'
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
        <Text className={styles.meta}>
          {conflict.commitsBehind} commit{conflict.commitsBehind === 1 ? '' : 's'} behind (base
          commit: <Text className={styles.metaMono}>{conflict.baseCommit}</Text>)
        </Text>
      ) : null}

      {conflict.fileDetailsUnavailable ? (
        <View>
          <Text className={styles.noticeTitle}>
            This branch has conflicts that must be resolved
          </Text>
          <Text className={styles.noticeBody}>{noticeBody}</Text>
          {conflict.mergeabilityRefreshCommands ? (
            <View className={styles.commandBox}>
              <View className={styles.commandHeader}>
                <Text className={styles.commandLabel}>Run from this worktree</Text>
                <Pressable
                  className={cn(styles.copyCommandButton, styles.copyCommandButtonPressedActive)}
                  onPress={() => void copyRefreshCommands()}
                  accessibilityRole="button"
                  accessibilityLabel="Copy mergeability refresh commands"
                >
                  {commandsCopied ? (
                    <Check size={13} colorClassName="accent-foreground" />
                  ) : (
                    <Copy size={13} colorClassName="accent-foreground" />
                  )}
                  <Text className={styles.copyCommandText}>
                    {commandsCopied ? 'Copied' : 'Copy commands'}
                  </Text>
                </Pressable>
              </View>
              <Text selectable className={styles.commandText}>
                {conflict.mergeabilityRefreshCommands}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View>
          <View className={styles.filesHeader}>
            <FileWarning size={14} colorClassName="accent-muted-foreground" />
            <Text className={styles.filesHeaderText}>Conflicting files</Text>
          </View>
          <ScrollView
            className={styles.fileList}
            contentContainerClassName={styles.fileListContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {conflict.files.map((filePath) => (
              <View key={filePath} className={styles.fileRow}>
                <Text className={styles.filePath}>{filePath}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* "Resolve conflicts with AI" — mirrors desktop's PRTriageStrip. Launches an
          agent that brings the base branch in and completes the merge. */}
      {triage ? (
        <View className={triageStyles.triageArea}>
          <Pressable
            className={cn(triageStyles.triageButton, triageStyles.triageButtonPressedActive)}
            onPress={triage.resolveConflicts}
            disabled={triage.isBusy}
            accessibilityRole="button"
            accessibilityLabel="Resolve conflicts with AI"
          >
            {triage.isBusy ? (
              <ActivityIndicator colorClassName="accent-muted-foreground" />
            ) : (
              <Sparkles size={14} colorClassName="accent-muted-foreground" />
            )}
            <Text className={triageStyles.triageButtonText}>Resolve conflicts with AI</Text>
          </Pressable>
          {triage.error ? <Text className={triageStyles.triageError}>{triage.error}</Text> : null}
        </View>
      ) : null}
    </PRSection>
  )
}
