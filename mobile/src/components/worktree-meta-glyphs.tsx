import { GitMerge, MessageSquare } from 'lucide-react-native'
import { View } from 'react-native'
import { colors } from '../theme/mobile-theme'
import { prStateToken } from './pr-state-token'
import { statusColor } from './pr-sidebar/pr-sidebar-status-color'

export function prStateColor(state: string): string {
  return statusColor(prStateToken(state))
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      {hasNotes && <MessageSquare size={11} color={colors.textMuted} />}
      {hasReview && <GitMerge size={11} color={colors.textMuted} />}
    </View>
  )
}
