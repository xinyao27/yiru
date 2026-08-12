export type BottomDrawerHeaderAction = {
  disabled?: boolean
  label: string
  onPress: () => void
}

export type BottomDrawerHeaderProps = {
  action?: BottomDrawerHeaderAction
  leadingAccessibilityLabel: string
  onLeadingPress: () => void
  title: string
}
