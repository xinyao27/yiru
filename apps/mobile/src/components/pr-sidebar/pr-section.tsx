import type { ReactNode } from 'react'
import { Text, View } from 'react-native'

import { mobilePrSidebarStyles as styles } from './mobile-pr-sidebar-styles'

type Props = {
  // Optional: omit for self-explanatory sections (e.g. action buttons) so the
  // header row doesn't waste vertical space on mobile.
  title?: string
  // Optional trailing control(s) in the header row (e.g. add-reviewer, checks
  // summary + rerun). Rendered right-aligned opposite the title.
  trailing?: ReactNode
  children: ReactNode
}

// Shared card shell for PR sections (Actions/Reviewers/Checks). Mirrors the
// desktop PR page's card-with-header-divider so the sections read consistently.
// Header is omitted when neither title nor trailing is provided.
export function PRSection({ title, trailing, children }: Props) {
  const showHeader = Boolean(title) || trailing != null
  return (
    <View className={styles.section}>
      {showHeader ? (
        <View className={styles.sectionHeader}>
          {title ? <Text className={styles.sectionLabel}>{title}</Text> : null}
          {trailing ? <View className={styles.sectionHeaderTrailing}>{trailing}</View> : null}
        </View>
      ) : null}
      <View className={styles.sectionBody}>{children}</View>
    </View>
  )
}
