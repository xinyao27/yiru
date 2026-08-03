import { View } from 'react-native'

import { GitMerge, Chat as MessageSquare } from '~/components/uniwind-icons'
import { statusColorClasses, type StatusColorClasses } from '~/session/pr/sidebar/status-color'
import { prStateToken } from '~/session/pr/state-token'

export function prStateColorClasses(state: string): StatusColorClasses {
  return statusColorClasses(prStateToken(state))
}

type Props = {
  comment?: string | null
  linkedPR?: number | null
  linkedGitLabMR?: number | null
}

export function WorkspaceMetaGlyphs({ comment, linkedPR, linkedGitLabMR }: Props) {
  const hasNotes = Boolean(comment?.trim())
  const hasReview = linkedPR == null && linkedGitLabMR != null
  if (!hasNotes && !hasReview) {
    return null
  }
  return (
    <View className="flex-row items-center gap-2">
      {hasNotes && <MessageSquare size={16} colorClassName="accent-muted-foreground" />}
      {hasReview && <GitMerge size={16} colorClassName="accent-muted-foreground" />}
    </View>
  )
}
