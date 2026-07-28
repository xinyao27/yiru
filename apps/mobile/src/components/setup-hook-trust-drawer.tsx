import { Pressable, Text, View } from 'react-native'

import { Check } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { BottomDrawer } from './bottom-drawer'
import { MobileGlassSection } from './glass/section'

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
          <View className="mb-3 px-1">
            <Text className="text-foreground text-sm font-semibold">
              {prompt.previouslyApproved
                ? `${prompt.repoName}'s setup script changed`
                : `Run setup from ${prompt.repoName}?`}
            </Text>
            <Text className="text-muted-foreground mt-0.5 text-xs">
              This repository's yiru.yaml runs before the workspace starts. Only run it if you trust
              this repository.
            </Text>
          </View>

          <View className="border-border bg-secondary mb-3 rounded-2xl border p-3">
            <Text className="text-muted-foreground mb-2 text-xs font-semibold">
              {prompt.previouslyApproved ? 'New setup script' : 'Setup script'}
            </Text>
            <Text className="text-foreground font-mono text-xs">{prompt.scriptContent}</Text>
          </View>

          <MobileGlassSection>
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
          </MobileGlassSection>
        </View>
      ) : null}
    </BottomDrawer>
  )
}

const styles = {
  trustActionRow: cn('flex-row items-center gap-2 py-3 px-3'),
  trustActionText: cn('flex-1 text-sm text-foreground font-medium'),
  trustActionSeparator: cn('h-hairline bg-border mx-3')
} as const
