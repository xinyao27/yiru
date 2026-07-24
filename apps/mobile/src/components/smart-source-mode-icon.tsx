import { TextAa as CaseSensitive, GitMerge, Sparkle as Sparkles } from '@/components/uniwind-icons'

import type { SmartModeIcon } from '../workspace-create/mobile-smart-source-modes'
import { SourceProviderLogo } from './source-provider-logo'

export function SmartSourceModeIcon({
  icon,
  colorClassName
}: {
  icon: SmartModeIcon
  colorClassName: string
}) {
  if (icon.type === 'provider') {
    return <SourceProviderLogo provider={icon.provider} size={14} colorClassName={colorClassName} />
  }
  if (icon.name === 'sparkles') {
    return <Sparkles size={14} colorClassName={colorClassName} />
  }
  if (icon.name === 'git-merge') {
    return <GitMerge size={14} colorClassName={colorClassName} />
  }
  return <CaseSensitive size={14} colorClassName={colorClassName} />
}
