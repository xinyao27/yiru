import { MobileGlassTextButton } from '~/components/glass/text-button'

import type { SubmitActionProps } from './submit-action-props'

export function SubmitAction({ disabled, label, onPress }: SubmitActionProps): React.JSX.Element {
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
