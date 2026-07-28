import type { ReactNode } from 'react'
import { Text, View } from 'react-native'

import { MobileGlassSection } from '../glass/section'
import { mobilePrSidebarStyles as styles } from './styles'

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
    <MobileGlassSection className={styles.section}>
      {showHeader ? (
        <View className="border-b-hairline border-b-border min-h-10 flex-row items-center justify-between gap-2 px-3 py-2">
          {title ? <Text className="text-foreground text-xs font-semibold">{title}</Text> : null}
          {trailing ? <View className="flex-row items-center gap-2">{trailing}</View> : null}
        </View>
      ) : null}
      <View className={styles.sectionBody}>{children}</View>
    </MobileGlassSection>
  )
}
