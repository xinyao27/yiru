import { Pressable, Text, View } from 'react-native'

import { Check } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { BottomDrawer } from './bottom-drawer'

export type SetupTrustPrompt = {
  repoId: string
  repoName: string
  scriptContent: string
  contentHash: string
  previouslyApproved: boolean
}

type Props = {
  visible: boolean
  prompt: SetupTrustPrompt | null
  busy: boolean
  onRunOnce: () => void
  onAlwaysTrust: () => void
  onDontRun: () => void
  onClose: () => void
}

// The repo-owned yiru.yaml setup-hook trust prompt, shown before a workspace
// create that would run an untrusted setup script. Extracted from NewWorktreeModal
// to keep that file focused; the async persist/create logic stays with the caller.
export function SetupHookTrustDrawer({
  visible,
  prompt,
  busy,
  onRunOnce,
  onAlwaysTrust,
  onDontRun,
  onClose
}: Props) {
  return (
    <BottomDrawer visible={visible && prompt != null} onClose={onClose}>
      {prompt ? (
        <View>
          <View className={styles.trustHeader}>
            <Text className={styles.title}>
              {prompt.previouslyApproved
                ? `${prompt.repoName}'s setup script changed`
                : `Run setup from ${prompt.repoName}?`}
            </Text>
            <Text className={styles.subtitle}>
              This repository's yiru.yaml runs before the workspace starts. Only run it if you trust
              this repository.
            </Text>
          </View>

          <View className={styles.trustScriptBox}>
            <Text className={styles.trustScriptLabel}>
              {prompt.previouslyApproved ? 'New setup script' : 'Setup script'}
            </Text>
            <Text className={styles.trustScriptText}>{prompt.scriptContent}</Text>
          </View>

          <View className={styles.trustActionGroup}>
            <Pressable className={styles.trustActionRow} disabled={busy} onPress={onRunOnce}>
              <Check size={16} colorClassName="accent-foreground" />
              <Text className={styles.trustActionText}>Run hooks</Text>
            </Pressable>
            <View className={styles.trustActionSeparator} />
            <Pressable className={styles.trustActionRow} disabled={busy} onPress={onAlwaysTrust}>
              <Check size={16} colorClassName="accent-foreground" />
              <Text className={styles.trustActionText}>Always trust and run</Text>
            </Pressable>
            <View className={styles.trustActionSeparator} />
            <Pressable className={styles.trustActionRow} disabled={busy} onPress={onDontRun}>
              <Text className={styles.trustActionText}>Don't run</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </BottomDrawer>
  )
}

const styles = {
  title: cn('text-[15px] font-semibold text-foreground'),
  subtitle: cn('text-[13px] text-muted-foreground/60 mt-[2px]'),
  trustHeader: cn('px-1 mb-3'),
  trustScriptBox: cn('bg-secondary rounded-none border border-border p-3 mb-3'),
  trustScriptLabel: cn('text-[12px] font-semibold text-muted-foreground mb-2'),
  trustScriptText: cn('text-[13px] font-mono text-foreground'),
  trustActionGroup: cn('bg-card rounded-none overflow-hidden'),
  trustActionRow: cn('flex-row items-center gap-2 py-3 px-3'),
  trustActionText: cn('flex-1 text-[14px] text-foreground font-medium'),
  trustActionSeparator: cn('h-hairline bg-border mx-3')
} as const
