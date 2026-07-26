import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'

import { cn } from '@/style/class-names'

import { triggerError, triggerSuccess } from '../../platform/haptics'
import { parseGitHubPrReference } from '../../source-control/github-pr-link-parse'
import { linkMobilePr } from '../../source-control/pr-link'
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
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-foreground text-sm font-bold">Link existing pull request</Text>
        <Pressable
          onPress={onCancel}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          hitSlop={8}
        >
          <Text className="text-muted-foreground text-xs font-semibold">Cancel</Text>
        </Pressable>
      </View>
      <Text className="text-muted-foreground mt-2 mb-1 text-xs">PR number or GitHub URL</Text>
      <TextInput
        className="bg-secondary text-foreground rounded-xl px-3 py-2 text-sm"
        value={input}
        onChangeText={setInput}
        placeholder="#123 or https://github.com/owner/repo/pull/123"
        placeholderTextColorClassName="accent-muted-foreground"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!submitting}
      />
      {error ? <Text className="text-destructive mt-3 text-xs">{error}</Text> : null}
      <Pressable
        className={cn(
          'mt-4 min-h-12 items-center justify-center rounded-xl bg-primary',
          (submitting || parsed === null) && 'opacity-50',
          'active:bg-accent'
        )}
        disabled={submitting || parsed === null}
        onPress={() => void submit()}
      >
        {submitting ? (
          <ActivityIndicator size="small" colorClassName="accent-primary-foreground" />
        ) : (
          <Text className="text-primary-foreground text-sm font-semibold">
            {parsed ? `Link #${parsed}` : 'Link pull request'}
          </Text>
        )}
      </Pressable>
    </View>
  )
}
