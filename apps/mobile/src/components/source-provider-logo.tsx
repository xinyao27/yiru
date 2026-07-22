import { GithubLogo, GitlabLogo } from '@/components/uniwind-icons'

export type SourceProviderLogoKind = 'github' | 'gitlab'

type Props = {
  provider: SourceProviderLogoKind
  size?: number
  colorClassName?: string
}

export function SourceProviderLogo({ provider, size = 16, colorClassName }: Props) {
  const Logo = provider === 'github' ? GithubLogo : GitlabLogo
  return <Logo size={size} colorClassName={colorClassName} />
}
