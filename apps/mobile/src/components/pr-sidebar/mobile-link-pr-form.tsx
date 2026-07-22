import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'

import { cn } from '@/style/class-names'

import { triggerError, triggerSuccess } from '../../platform/haptics'
import { parseGitHubPrReference } from '../../source-control/github-pr-link-parse'
import { linkMobilePr } from '../../source-control/mobile-pr-link'
import type { RpcClient } from '../../transport/rpc-client'

type Props = {
  client: RpcClient | null
  worktreeId: string
  onCancel: () => void
  onLinked: () => void
}

// Link-an-existing-PR form body (number or GitHub URL). Renders a plain View so
// it can sit inline inside the PR sidebar's ScrollView, mirroring the compose
// form fix — a BottomDrawer overlay nested in a ScrollView gets clipped.
export function MobileLinkPrForm({ client, worktreeId, onCancel, onLinked }: Props) {
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = parseGitHubPrReference(input)

  const submit = useCallback(async () => {
    if (!client || submitting || parsed === null) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const outcome = await linkMobilePr(client, worktreeId, parsed)
      if (outcome.ok) {
        triggerSuccess()
        onLinked()
      } else {
        triggerError()
        setError(outcome.error)
      }
    } finally {
      setSubmitting(false)
    }
  }, [client, onLinked, parsed, submitting, worktreeId])

  return (
    <View>
      <View className={styles.headingRow}>
        <Text className={styles.heading}>Link existing pull request</Text>
        <Pressable
          onPress={onCancel}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          hitSlop={8}
        >
          <Text className={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
      <Text className={styles.label}>PR number or GitHub URL</Text>
      <TextInput
        className={styles.input}
        value={input}
        onChangeText={setInput}
        placeholder="#123 or https://github.com/owner/repo/pull/123"
        placeholderTextColorClassName="accent-muted-foreground"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!submitting}
      />
      {error ? <Text className={styles.error}>{error}</Text> : null}
      <Pressable
        className={cn(
          styles.submit,
          (submitting || parsed === null) && styles.submitDisabled,
          styles.submitPressedActive
        )}
        disabled={submitting || parsed === null}
        onPress={() => void submit()}
      >
        {submitting ? (
          <ActivityIndicator size="small" colorClassName="accent-primary-foreground" />
        ) : (
          <Text className={styles.submitText}>
            {parsed ? `Link #${parsed}` : 'Link pull request'}
          </Text>
        )}
      </Pressable>
    </View>
  )
}

const styles = {
  headingRow: cn('flex-row items-center justify-between mb-2'),
  heading: cn('text-foreground text-[14px] font-bold'),
  cancelText: cn('text-muted-foreground text-[12px] font-semibold'),
  label: cn('text-muted-foreground text-[12px] mt-2 mb-1'),
  input: cn('bg-secondary rounded-none px-3 py-2 text-foreground text-[14px]'),
  error: cn('text-destructive text-[12px] mt-3'),
  submit: cn('mt-4 min-h-[46px] rounded-none bg-foreground items-center justify-center'),
  submitDisabled: cn('opacity-[0.45]'),
  submitPressedActive: cn('active:opacity-[0.8]'),
  submitText: cn('text-background text-[14px] font-semibold')
} as const
