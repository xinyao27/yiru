import { Pressable, Text, View } from 'react-native'

import { BottomDrawer } from '~/components/bottom-drawer'
import { MobileContentSection } from '~/components/content-section'
import { Check } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'
import { cn } from '~/style/class-names'

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

// Why: trust persistence and workspace creation stay with the modal, while this
// feature-owned drawer contains the closed choice the user must review.
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
                ? translate(
                    'mobile.newWorkspace.setupTrust.changedTitle',
                    "{{repo}}'s setup script changed",
                    { repo: prompt.repoName }
                  )
                : translate('mobile.newWorkspace.setupTrust.title', 'Run setup from {{repo}}?', {
                    repo: prompt.repoName
                  })}
            </Text>
            <Text className="text-muted-foreground mt-1 text-xs">
              {translate(
                'mobile.newWorkspace.setupTrust.description',
                "This repository's yiru.yaml runs before the workspace starts. Only run it if you trust this repository."
              )}
            </Text>
          </View>

          <View className="border-border bg-secondary mb-3 rounded-2xl border p-3">
            <Text className="text-muted-foreground mb-2 text-xs font-semibold">
              {prompt.previouslyApproved
                ? translate('mobile.newWorkspace.setupTrust.newScript', 'New setup script')
                : translate('mobile.newWorkspace.setupTrust.script', 'Setup script')}
            </Text>
            <Text className="text-foreground font-mono text-xs">{prompt.scriptContent}</Text>
          </View>

          <MobileContentSection>
            <Pressable className={styles.trustActionRow} disabled={busy} onPress={onRunOnce}>
              <Check size={16} colorClassName="accent-foreground" />
              <Text className={styles.trustActionText}>
                {translate('mobile.newWorkspace.setupTrust.runOnce', 'Run hooks')}
              </Text>
            </Pressable>
            <View className={styles.trustActionSeparator} />
            <Pressable className={styles.trustActionRow} disabled={busy} onPress={onAlwaysTrust}>
              <Check size={16} colorClassName="accent-foreground" />
              <Text className={styles.trustActionText}>
                {translate('mobile.newWorkspace.setupTrust.alwaysTrust', 'Always trust and run')}
              </Text>
            </Pressable>
            <View className={styles.trustActionSeparator} />
            <Pressable className={styles.trustActionRow} disabled={busy} onPress={onDontRun}>
              <Text className={styles.trustActionText}>
                {translate('mobile.newWorkspace.setupTrust.dontRun', "Don't run")}
              </Text>
            </Pressable>
          </MobileContentSection>
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
