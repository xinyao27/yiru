import type { GitHubWorkItemDetails, PRInfo } from '@yiru/workbench-model/review'
import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'

import { ArrowRight, ArrowSquareOut as ExternalLink, Pencil } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { canEditPRTitle } from '../../session/pr-title-edit'
import type { MobilePrTitleAction } from '../../session/use-mobile-pr-title-action'
import { openMobilePrUrl } from '../mobile-pr-compose-sheet'
import { mobilePrSidebarStyles as styles } from './mobile-pr-sidebar-styles'
import { prStateBadge } from './pr-checks-presentation'
import { prCommentComposerStyles as composerStyles } from './pr-comment-composer-styles'
import { statusColorClasses } from './pr-sidebar-status-color'

type Props = {
  pr: PRInfo
  details: GitHubWorkItemDetails | null
  // Inline title-edit action; the pencil affordance only shows when the PR is editable.
  titleAction: MobilePrTitleAction
  // Hub chrome already surfaces open-on-web; hide the duplicate icon in that case.
  showOpenOnWeb?: boolean
  // When true, render without section chrome so identity can share a card with actions.
  bare?: boolean
}

// Compact identity: state + # + author on one meta row, title, head→base.
// # lives only in the meta row (not also after the title) to avoid repetition.
export function PRSidebarHeader({
  pr,
  details,
  titleAction,
  showOpenOnWeb = true,
  bare = false
}: Props) {
  const item = details?.item
  const badge = prStateBadge(pr.state)
  const badgeColors = statusColorClasses(badge.token)
  const title = item?.title ?? pr.title
  const author = item?.author ?? null
  const baseRef = item?.baseRefName ?? null
  const headRef = item?.branchName ?? null
  const editable = canEditPRTitle(pr.state)
  const openPr = pr.url ? () => openMobilePrUrl(pr.url) : undefined

  const body = (
    <>
      <View className={styles.metaRow}>
        <View className={styles.metaLeft}>
          <Pressable
            onPress={openPr}
            disabled={!openPr}
            accessibilityRole="link"
            accessibilityLabel={`Open pull request #${pr.number} on the web`}
            className={cn(styles.badge, badgeColors.border, 'active:opacity-[0.6]')}
          >
            <Text className={cn(styles.badgeText, badgeColors.text)}>{badge.label}</Text>
          </Pressable>
          <Text
            className={styles.prMetaStrong}
            onPress={openPr}
            accessibilityRole="link"
            accessibilityLabel={`Open pull request #${pr.number} on the web`}
          >
            #{pr.number}
          </Text>
          {author ? <Text className={styles.prMeta}>· {author}</Text> : null}
        </View>
        {showOpenOnWeb && openPr ? (
          <Pressable
            onPress={openPr}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={`Open pull request #${pr.number} in browser`}
            className={cn(styles.iconButton, 'active:opacity-[0.6]')}
          >
            <ExternalLink size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
        ) : null}
      </View>
      <PRTitle title={title} editable={editable} titleAction={titleAction} />
      {baseRef && headRef ? (
        <View className={styles.branchRow}>
          <Text className={styles.branchPill} numberOfLines={1}>
            {headRef}
          </Text>
          <ArrowRight size={12} colorClassName="accent-muted-foreground" />
          <Text className={styles.branchPill} numberOfLines={1}>
            {baseRef}
          </Text>
        </View>
      ) : null}
    </>
  )

  if (bare) {
    return <View className={styles.identityBlock}>{body}</View>
  }
  return (
    <View className={styles.section}>
      <View className={styles.sectionBody}>{body}</View>
    </View>
  )
}

function PRTitle({
  title,
  editable,
  titleAction
}: {
  title: string
  editable: boolean
  titleAction: MobilePrTitleAction
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)

  const startEdit = () => {
    titleAction.clearError()
    setDraft(title)
    setEditing(true)
  }
  const cancel = () => {
    titleAction.clearError()
    setEditing(false)
  }
  const save = async () => {
    // setTitle trims + short-circuits empty/unchanged to a successful no-op; on a
    // real edit it refetches, so on success we just collapse the editor.
    const ok = await titleAction.setTitle(draft, title)
    if (ok) {
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <View className={composerStyles.container}>
        <TextInput
          className={composerStyles.input}
          style={{ textAlignVertical: 'top' }}
          value={draft}
          onChangeText={setDraft}
          placeholderTextColorClassName="accent-muted-foreground"
          editable={!titleAction.saving}
          autoFocus
        />
        {titleAction.error ? (
          <Text className={composerStyles.error}>{titleAction.error}</Text>
        ) : null}
        <View className={composerStyles.actions}>
          <Pressable
            className={cn(composerStyles.cancel, composerStyles.pressedActive)}
            onPress={cancel}
            disabled={titleAction.saving}
            accessibilityRole="button"
            accessibilityLabel="Cancel editing title"
          >
            <Text className={composerStyles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            className={cn(composerStyles.submit, composerStyles.pressedActive)}
            onPress={() => void save()}
            disabled={titleAction.saving}
            accessibilityRole="button"
            accessibilityLabel="Save title"
          >
            {titleAction.saving ? (
              <ActivityIndicator size="small" colorClassName="accent-primary-foreground" />
            ) : (
              <Text className={composerStyles.submitText}>Save</Text>
            )}
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <Pressable
      className={styles.titleRow}
      onPress={editable ? startEdit : undefined}
      disabled={!editable}
      accessibilityRole={editable ? 'button' : undefined}
      accessibilityLabel={editable ? 'Edit pull request title' : undefined}
    >
      <Text className={styles.prTitle}>{title}</Text>
      {editable ? (
        <View className={styles.titleEditButton}>
          <Pencil size={14} colorClassName="accent-muted-foreground" />
        </View>
      ) : null}
    </Pressable>
  )
}
