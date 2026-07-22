import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from 'react-native'

import {
  ArrowRight,
  GitMerge,
  GitPullRequest as GitPullRequestArrow,
  Sparkle as Sparkles,
  Warning as TriangleAlert,
  X
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { triggerError, triggerSuccess } from '../../platform/haptics'
import { hostedReviewCopy } from '../../source-control/hosted-review-copy'
import {
  createMobilePr,
  getMobilePrCreateSuccessWarning,
  shouldPushBeforeMobilePrCreate,
  type MobilePrPrefill
} from '../../source-control/mobile-pr-create'
import {
  getPrComposeDisabledReason,
  isBaseHeadDistinct
} from '../../source-control/pr-compose-validation'
import type { RpcClient } from '../../transport/rpc-client'
import type { RpcSuccess } from '../../transport/types'
import { MobilePrBasePicker } from '../mobile-pr-base-picker'
import { mobilePrComposeFormStyles as styles } from './mobile-pr-compose-form-styles'

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
}: Props) {
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
        setError(response.error?.message || 'Failed to generate PR fields')
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
      setError(err instanceof Error ? err.message : 'Failed to generate PR fields')
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
    <View className={styles.root}>
      <View className={styles.headingRow}>
        <View className={styles.headingTitle}>
          <ReviewIcon size={14} colorClassName="accent-muted-foreground" />
          <Text className={styles.heading}>New {copy.reviewLabel}</Text>
        </View>
        <View className={styles.headingActions}>
          <Pressable
            className={cn(styles.genButton, styles.genButtonPressedActive)}
            disabled={generating || submitting}
            onPress={() => void generate()}
            accessibilityRole="button"
            accessibilityLabel={`Generate ${copy.reviewLabel} details with AI`}
          >
            {generating ? (
              <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
            ) : (
              <Sparkles size={13} colorClassName="accent-muted-foreground" />
            )}
            <Text className={styles.genButtonText}>{generating ? 'Generating…' : 'Generate'}</Text>
          </Pressable>
          <Pressable
            className={styles.iconButton}
            onPress={onCancel}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={8}
          >
            <X size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>
      </View>

      {head ? (
        <View className={styles.branchFlow}>
          <Text className={styles.branchToken} numberOfLines={1}>
            {head}
          </Text>
          <ArrowRight size={12} colorClassName="accent-muted-foreground" />
          <Text
            className={cn(styles.branchToken, baseConflict && styles.branchTokenError)}
            numberOfLines={1}
          >
            {base || 'base'}
          </Text>
        </View>
      ) : null}

      <View className={styles.fieldStack}>
        <TextInput
          className={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColorClassName="accent-muted-foreground"
          editable={!fieldsLocked}
          accessibilityLabel={`${copy.titleLabel} title`}
        />
        <TextInput
          className={styles.bodyInput}
          style={{ textAlignVertical: 'top' }}
          value={body}
          onChangeText={setBody}
          placeholder="Description (optional)"
          placeholderTextColorClassName="accent-muted-foreground"
          multiline
          editable={!fieldsLocked}
          accessibilityLabel={`${copy.titleLabel} description`}
        />
      </View>

      {generating ? (
        <View className={styles.notice}>
          <Sparkles size={13} colorClassName="accent-muted-foreground" />
          <Text className={styles.noticeText}>Generating title and description…</Text>
        </View>
      ) : null}

      <View className={styles.baseRow}>
        <Text className={styles.baseLabel}>Base</Text>
        <View className={styles.baseControl}>
          <MobilePrBasePicker
            client={client}
            worktreeId={worktreeId}
            value={base}
            onChange={setBase}
            editable={!fieldsLocked}
          />
        </View>
      </View>

      <View className={styles.draftRow}>
        <Text className={styles.draftText}>Create as draft</Text>
        <Switch
          value={draft}
          onValueChange={setDraft}
          disabled={fieldsLocked}
          trackColorOffClassName="accent-secondary disabled:accent-muted"
          trackColorOnClassName="accent-muted-foreground disabled:accent-muted"
          thumbColorClassName="accent-foreground disabled:accent-muted-foreground"
          ios_backgroundColorClassName="accent-secondary"
        />
      </View>
      {error || submitDisabledReason ? (
        <View className={styles.notice}>
          <TriangleAlert size={13} colorClassName="accent-destructive" />
          <Text className={cn(styles.noticeText, styles.errorText)}>
            {error ?? submitDisabledReason}
          </Text>
        </View>
      ) : null}
      <Pressable
        className={cn(
          styles.submit,
          (submitting || !canSubmit) && styles.submitDisabled,
          styles.submitPressedActive
        )}
        disabled={submitting || !canSubmit}
        onPress={() => void submit()}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator size="small" colorClassName="accent-primary-foreground" />
        ) : (
          <ReviewIcon size={14} colorClassName="accent-primary-foreground" />
        )}
        <Text className={styles.submitText}>
          {pushBeforeCreate
            ? draft
              ? `Push & create draft ${copy.shortLabel}`
              : `Push & create ${copy.shortLabel}`
            : draft
              ? `Create draft ${copy.shortLabel}`
              : `Create ${copy.shortLabel}`}
        </Text>
      </Pressable>
    </View>
  )
}
