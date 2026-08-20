import type { DiffComment } from '~shared/types'

/** A stored diff comment plus the presentation fields a surface renders with. */
export type DecoratedDiffComment = DiffComment & {
  author?: string
  authorAvatarUrl?: string
  createdAtLabel?: string
  url?: string
  canDelete?: boolean
  canEdit?: boolean
}
