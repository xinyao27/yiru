import type { Icon } from '../components/uniwind-icons'

export type HomePrimaryActionButtonProps = {
  className: string
  containerClassName: string
  contentClassName: string
  icon: Icon
  label: string
  onPress: () => void
  systemImage: 'desktopcomputer' | 'plus'
}
