import { MobileGlassTextButton } from '~/components/glass/text-button'

type WorkspaceCreateSubmitActionProps = {
  disabled: boolean
  label: string
  onPress: () => void
}

export function WorkspaceCreateSubmitAction({
  disabled,
  label,
  onPress
}: WorkspaceCreateSubmitActionProps): React.JSX.Element {
  return (
    <MobileGlassTextButton
      disabled={disabled}
      isProminent
      label={label}
      onPress={onPress}
      size="large"
    />
  )
}
