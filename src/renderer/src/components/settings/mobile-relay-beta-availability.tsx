import { translate } from '@/i18n/i18n'
import { YIRU_GITHUB_RELEASES_URL } from '../../../../shared/yiru-github-repository'

export function MobileRelayBetaAvailability(): React.JSX.Element {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground/80">
        {translate('auto.components.settings.MobileRelayBetaAvailability.beta', 'Beta')}
      </span>
      <span aria-hidden="true">—</span>
      <span>
        {translate(
          'auto.components.settings.MobileRelayBetaAvailability.availability',
          'Mobile builds:'
        )}
      </span>
      <button
        type="button"
        className="rounded-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => void window.api.shell.openUrl(YIRU_GITHUB_RELEASES_URL)}
      >
        {translate(
          'auto.components.settings.MobileRelayBetaAvailability.githubReleases',
          'GitHub Releases'
        )}
      </button>
    </span>
  )
}
