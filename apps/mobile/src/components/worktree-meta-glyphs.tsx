import { View } from 'react-native'

import { GitMerge, Chat as MessageSquare } from '@/components/uniwind-icons'

import { statusColorClasses, type StatusColorClasses } from './pr-sidebar/pr-sidebar-status-color'
import { prStateToken } from './pr-state-token'

export function prStateColorClasses(state: string): StatusColorClasses {
  return statusColorClasses(prStateToken(state))
}

type Props = {
  comment?: string | null
  linkedPR?: number | null
  linkedGitLabMR?: number | null
}

export function WorktreeMetaGlyphs({ comment, linkedPR, linkedGitLabMR }: Props) {
  const hasNotes = Boolean(comment?.trim())
  const hasReview = linkedPR != null || linkedGitLabMR != null
  if (!hasNotes && !hasReview) {
    return null
  }
  return (
    <View className="flex-row items-center gap-[5px]">
      {hasNotes && <MessageSquare size={11} colorClassName="accent-muted-foreground" />}
      {hasReview && <GitMerge size={11} colorClassName="accent-muted-foreground" />}
    </View>
  )
}
