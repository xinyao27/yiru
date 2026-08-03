import { useCallback, useState } from 'react'
import { ActivityIndicator, Text, TextInput, View } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { MobileGlassPressable } from '~/components/glass/pressable'
import { MobileGlassSurface } from '~/components/glass/surface'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { SettingsToggleRow } from '~/components/settings-toggle-row'
import {
  ArrowRight,
  GitMerge,
  GitPullRequest as GitPullRequestArrow,
  Sparkle as Sparkles,
  Warning as TriangleAlert
} from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'
import { triggerError, triggerSuccess } from '~/platform/haptics'
import { MobilePrBasePicker } from '~/session/pr/base-picker'
import { hostedReviewCopy } from '~/source-control/hosted-review-copy'
import {
  getPrComposeDisabledReason,
  isBaseHeadDistinct
} from '~/source-control/pr-compose-validation'
import {
  createMobilePr,
  getMobilePrCreateSuccessWarning,
  shouldPushBeforeMobilePrCreate,
  type MobilePrPrefill
} from '~/source-control/pr-create'
import { cn } from '~/style/class-names'
import type { RpcClient } from '~/transport/rpc-client'
import type { RpcSuccess } from '~/transport/types'

import { mobilePrComposeFormStyles as styles } from './compose-form-styles'

export type PrComposePrefill = MobilePrPrefill

type Props = {
  client: RpcClient | null
  worktreeId: string
  prefill: PrComposePrefill
  // Head branch — enables the base≠head guard and the "from <branch>" hint.
  head?: string | null
  onCancel: () => void
  onCreated: (url: string, warning?: string) => void
}

// PR compose form body: title/body/base/draft with AI prefill (git.generate
// PullRequestFields), submitting via createMobilePr. Renders a plain View so it
// can sit inline inside the PR sidebar's existing ScrollView (a BottomDrawer
// overlay trapped in a ScrollView clips the form). The BottomDrawer wrapper
// MobilePrComposeSheet reuses this body at full-screen roots.
export function MobilePrComposeForm({
  client,
  worktreeId,
  prefill,
  head,
  onCancel,
  onCreated
}: Props): React.JSX.Element {
  const copy = hostedReviewCopy(prefill.provider)
  const ReviewIcon = prefill.provider === 'gitlab' ? GitMerge : GitPullRequestArrow
  const [title, setTitle] = useState(prefill.title)
  const [body, setBody] = useState(prefill.body)
  const [base, setBase] = useState(prefill.base)
  const [draft, setDraft] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pushBeforeCreate = shouldPushBeforeMobilePrCreate(prefill)

  const generate = useCallback(async () => {
    if (!client || generating) {
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const response = await client.sendRequest('git.generatePullRequestFields', {
        worktree: `id:${worktreeId}`,
        base,
        title,
        body,
        draft
      })
      if (!response.ok) {
        setError(
          response.error?.message ||
            translate('mobile.pullRequest.compose.generate.error', 'Failed to generate PR fields')
        )
        return
      }
      const result = (response as RpcSuccess).result as {
        success?: boolean
        fields?: { base: string; title: string; body: string; draft: boolean }
        error?: string
      }
      if (result.success && result.fields) {
        setBase(result.fields.base || base)
        setTitle(result.fields.title || title)
        setBody(result.fields.body || body)
        setDraft(result.fields.draft)
      } else if (result.error) {
        setError(result.error)
      }
    } catch (err) {
      triggerError()
      setError(
        err instanceof Error
          ? err.message
          : translate('mobile.pullRequest.compose.generate.error', 'Failed to generate PR fields')
      )
    } finally {
      setGenerating(false)
    }
  }, [base, body, client, draft, generating, title, worktreeId])

  const headRef = head ?? ''
  const baseConflict = base.trim().length > 0 && !isBaseHeadDistinct(base, headRef)
  const submitDisabledReason = getPrComposeDisabledReason({
    title,
    base,
    head: headRef,
    generating,
    reviewLabel: copy.reviewLabel
  })
  const canSubmit = submitDisabledReason === null
  const fieldsLocked = submitting || generating

  const submit = useCallback(async () => {
    if (!client || submitting || !canSubmit) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const outcome = await createMobilePr(client, worktreeId, {
        provider: prefill.provider,
        base,
        // Send the same head the submit guard validated against, so the PR opens
        // from the validated branch instead of a host-inferred one.
        ...(head ? { head } : {}),
        title,
        body,
        draft,
        pushBeforeCreate
      })
      if (outcome.ok) {
        triggerSuccess()
        const warning = getMobilePrCreateSuccessWarning(outcome, prefill.provider)
        if (warning) {
          setError(warning)
        }
        onCreated(outcome.url, warning)
      } else {
        triggerError()
        setError(outcome.error)
      }
    } finally {
      setSubmitting(false)
    }
  }, [
    base,
    body,
    canSubmit,
    client,
    copy.titleLabel,
    draft,
    head,
    onCreated,
    prefill.provider,
    pushBeforeCreate,
    submitting,
    title,
    worktreeId
  ])

  return (
    <View className="gap-2">
      <View className="mb-1 flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-1">
          <ReviewIcon size={14} colorClassName="accent-muted-foreground" />
          <Text className="text-foreground text-sm font-bold">
            {translate('mobile.pullRequest.compose.title', 'New {{review}}', {
              review: copy.reviewLabel
            })}
          </Text>
        </View>
        <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
          <MobileGlassPressable
            accessibilityLabel={translate(
              'mobile.pullRequest.compose.generate.accessibilityLabel',
              'Generate {{review}} details with AI',
              { review: copy.reviewLabel }
            )}
            accessibilityRole="button"
            className="min-h-8 rounded-full"
            contentClassName="min-h-8 flex-row items-center justify-center gap-1 rounded-full px-3"
            disabled={generating || submitting}
            onPress={() => void generate()}
          >
            {generating ? (
              <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
            ) : (
              <Sparkles size={13} colorClassName="accent-muted-foreground" />
            )}
            <Text className="text-muted-foreground text-xs">
              {generating
                ? translate('mobile.pullRequest.compose.generate.generatingLabel', 'Generating…')
                : translate('mobile.pullRequest.compose.generate.label', 'Generate')}
            </Text>
          </MobileGlassPressable>
          <MobileGlassIconButton
            accessibilityLabel={translate('mobile.pullRequest.compose.cancel', 'Cancel')}
            disabled={submitting}
            icon="close"
            onPress={onCancel}
            size="small"
          />
        </MobileGlassGroup>
      </View>

      {head ? (
        <View className="min-h-7 flex-row items-center gap-1">
          <Text className={styles.branchToken} numberOfLines={1}>
            {head}
          </Text>
          <ArrowRight size={12} colorClassName="accent-muted-foreground" />
          <Text
            className={cn(styles.branchToken, baseConflict && 'text-destructive')}
            numberOfLines={1}
          >
            {base || translate('mobile.pullRequest.compose.baseFallback', 'base')}
          </Text>
        </View>
      ) : null}

      <View className="gap-2">
        <MobileGlassSurface className="min-h-10 overflow-hidden rounded-xl" isInteractive>
          <TextInput
            className="text-foreground min-h-10 px-3 py-2 text-sm"
            value={title}
            onChangeText={setTitle}
            placeholder={translate('mobile.pullRequest.compose.titlePlaceholder', 'Title')}
            placeholderTextColorClassName="accent-muted-foreground"
            editable={!fieldsLocked}
            accessibilityLabel={translate(
              'mobile.pullRequest.compose.titleAccessibilityLabel',
              '{{review}} title',
              { review: copy.titleLabel }
            )}
          />
        </MobileGlassSurface>
        <MobileGlassSurface className="min-h-30 overflow-hidden rounded-xl" isInteractive>
          <TextInput
            className="text-foreground min-h-30 px-3 py-2 text-sm"
            textAlignVertical="top"
            value={body}
            onChangeText={setBody}
            placeholder={translate(
              'mobile.pullRequest.compose.descriptionPlaceholder',
              'Description (optional)'
            )}
            placeholderTextColorClassName="accent-muted-foreground"
            multiline
            editable={!fieldsLocked}
            accessibilityLabel={translate(
              'mobile.pullRequest.compose.descriptionAccessibilityLabel',
              '{{review}} description',
              { review: copy.titleLabel }
            )}
          />
        </MobileGlassSurface>
      </View>

      {generating ? (
        <View className={styles.notice}>
          <Sparkles size={13} colorClassName="accent-muted-foreground" />
          <Text className={styles.noticeText}>
            {translate(
              'mobile.pullRequest.compose.generate.notice',
              'Generating title and description…'
            )}
          </Text>
        </View>
      ) : null}

      <View className="min-h-10 flex-row items-center gap-2">
        <Text className="text-muted-foreground w-9 text-xs">
          {translate('mobile.pullRequest.compose.baseLabel', 'Base')}
        </Text>
        <View className="min-w-0 flex-1">
          <MobilePrBasePicker
            client={client}
            worktreeId={worktreeId}
            value={base}
            onChange={setBase}
            editable={!fieldsLocked}
          />
        </View>
      </View>

      <MobileGlassSurface className="min-h-11 overflow-hidden rounded-xl" isFunctional>
        <SettingsToggleRow
          disabled={fieldsLocked}
          label={translate('mobile.pullRequest.createAsDraft.label', 'Create as draft')}
          onValueChange={setDraft}
          value={draft}
        />
      </MobileGlassSurface>
      {error || submitDisabledReason ? (
        <View className={styles.notice}>
          <TriangleAlert size={13} colorClassName="accent-destructive" />
          <Text className={cn(styles.noticeText, 'text-destructive')}>
            {error ?? submitDisabledReason}
          </Text>
        </View>
      ) : null}
      {submitting ? (
        <View className="mt-1 min-h-11 items-center justify-center">
          <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        </View>
      ) : (
        <MobileGlassTextButton
          className="mt-1"
          disabled={!canSubmit}
          isFullWidth
          isProminent
          label={
            pushBeforeCreate
              ? draft
                ? translate(
                    'mobile.pullRequest.compose.submit.pushDraft',
                    'Push & create draft {{review}}',
                    { review: copy.shortLabel }
                  )
                : translate('mobile.pullRequest.compose.submit.push', 'Push & create {{review}}', {
                    review: copy.shortLabel
                  })
              : draft
                ? translate(
                    'mobile.pullRequest.compose.submit.createDraft',
                    'Create draft {{review}}',
                    { review: copy.shortLabel }
                  )
                : translate('mobile.pullRequest.compose.submit.create', 'Create {{review}}', {
                    review: copy.shortLabel
                  })
          }
          onPress={() => void submit()}
          size="large"
        />
      )}
    </View>
  )
}
