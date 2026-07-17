import { translate } from '@/i18n/i18n'
import { YIRU_GITHUB_RELEASES_URL } from '../../../../shared/yiru-github-repository'

export type MobileReleaseLink = { ctaLabel: string; url: string }

// Why: until platform-specific builds are published, one neutral release link
// avoids advertising install channels that do not yet have distinct assets.
export function getMobileReleaseLink(): MobileReleaseLink {
  return {
    ctaLabel: translate(
      'auto.components.mobile.mobile.platform.copy.releases.cta',
      'View mobile builds'
    ),
    url: YIRU_GITHUB_RELEASES_URL
  }
}
