import { useCallback, useState } from 'react'
import { ActivityIndicator, Text, TextInput, View } from 'react-native'

import { triggerError, triggerSuccess } from '../../platform/haptics'
import { parseGitHubPrReference } from '../../source-control/github-pr-link-parse'
import { linkMobilePr } from '../../source-control/pr-link'
import type { RpcClient } from '../../transport/rpc-client'
import { MobileGlassSurface } from '../glass/surface'
import { MobileGlassTextButton } from '../glass/text-button'

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
        <MobileGlassTextButton
          disabled={submitting}
          label="Cancel"
          onPress={onCancel}
          size="small"
        />
      </View>
      <Text className="text-muted-foreground mt-2 mb-1 text-xs">PR number or GitHub URL</Text>
      <MobileGlassSurface className="overflow-hidden rounded-xl" isInteractive>
        <TextInput
          className="text-foreground px-3 py-2 text-sm"
          value={input}
          onChangeText={setInput}
          placeholder="#123 or https://github.com/owner/repo/pull/123"
          placeholderTextColorClassName="accent-muted-foreground"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
        />
      </MobileGlassSurface>
      {error ? <Text className="text-destructive mt-3 text-xs">{error}</Text> : null}
      {submitting ? (
        <View className="mt-4 min-h-11 items-center justify-center">
          <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        </View>
      ) : (
        <MobileGlassTextButton
          className="mt-4"
          disabled={parsed === null}
          isFullWidth
          isProminent
          label={parsed ? `Link #${parsed}` : 'Link pull request'}
          onPress={() => void submit()}
          size="large"
        />
      )}
    </View>
  )
}
