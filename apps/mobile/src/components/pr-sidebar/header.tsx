import type { GitHubWorkItemDetails, PRInfo } from '@yiru/workbench-model/review'
import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'

import { ArrowRight, Pencil } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { canEditPRTitle } from '../../session/pr/title-edit'
import type { MobilePrTitleAction } from '../../session/pr/use-title-action'
import { MobileGlassIconButton } from '../glass/icon-button'
import { MobileGlassSection } from '../glass/section'
import { MobileGlassSurface } from '../glass/surface'
import { MobileGlassTextButton } from '../glass/text-button'
import { openMobilePrUrl } from '../pr-compose-sheet'
import { prStateBadge } from './pr-checks-presentation'
import { statusColorClasses } from './status-color'
import { mobilePrSidebarStyles as styles } from './styles'

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
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-1">
          <Pressable
            onPress={openPr}
            disabled={!openPr}
            accessibilityRole="link"
            accessibilityLabel={`Open pull request #${pr.number} on the web`}
            className={cn(
              'border-hairline self-start rounded-full bg-secondary px-2 py-0.5',
              badgeColors.border,
              'active:bg-accent'
            )}
          >
            <Text className={cn('text-xs font-bold', badgeColors.text)}>{badge.label}</Text>
          </Pressable>
          <Text
            className="text-foreground text-xs font-semibold"
            onPress={openPr}
            accessibilityRole="link"
            accessibilityLabel={`Open pull request #${pr.number} on the web`}
          >
            #{pr.number}
          </Text>
          {author ? <Text className="text-muted-foreground text-xs">· {author}</Text> : null}
        </View>
        {showOpenOnWeb && openPr ? (
          <MobileGlassIconButton
            accessibilityLabel={`Open pull request #${pr.number} in browser`}
            icon="external"
            onPress={openPr}
            size="small"
          />
        ) : null}
      </View>
      <PRTitle title={title} editable={editable} titleAction={titleAction} />
      {baseRef && headRef ? (
        <View className="flex-row flex-wrap items-center gap-1">
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
    return <View className="gap-2">{body}</View>
  }
  return (
    <MobileGlassSection className={styles.section}>
      <View className={styles.sectionBody}>{body}</View>
    </MobileGlassSection>
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
      <View className="gap-3">
        <MobileGlassSurface className="min-h-16 overflow-hidden rounded-xl" isInteractive>
          <TextInput
            className="text-foreground min-h-16 px-3 py-2 text-sm"
            style={{ textAlignVertical: 'top' }}
            value={draft}
            onChangeText={setDraft}
            placeholderTextColorClassName="accent-muted-foreground"
            editable={!titleAction.saving}
            autoFocus
          />
        </MobileGlassSurface>
        {titleAction.error ? (
          <Text className="text-destructive text-xs">{titleAction.error}</Text>
        ) : null}
        <View className="flex-row justify-end gap-2">
          <MobileGlassTextButton
            accessibilityLabel="Cancel editing title"
            disabled={titleAction.saving}
            label="Cancel"
            onPress={cancel}
            size="regular"
          />
          {titleAction.saving ? (
            <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
          ) : (
            <MobileGlassTextButton
              accessibilityLabel="Save title"
              isProminent
              label="Save"
              onPress={() => void save()}
              size="regular"
            />
          )}
        </View>
      </View>
    )
  }

  return (
    <Pressable
      className="flex-row items-start gap-1"
      onPress={editable ? startEdit : undefined}
      disabled={!editable}
      accessibilityRole={editable ? 'button' : undefined}
      accessibilityLabel={editable ? 'Edit pull request title' : undefined}
    >
      <Text className="text-foreground flex-1 text-sm leading-6 font-bold">{title}</Text>
      {editable ? (
        <View className="min-h-7 min-w-7 items-center justify-center">
          <Pencil size={14} colorClassName="accent-muted-foreground" />
        </View>
      ) : null}
    </Pressable>
  )
}
