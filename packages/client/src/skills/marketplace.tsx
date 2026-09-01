import { useEffect } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { DownloadSimple } from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'

import type { SkillInstallRequest } from './install-dialog'
import { SKILLS_MARKETPLACE_URL } from './marketplace-url'

export type SkillsMarketplaceProps = {
  /** Reports where the guest navigated, so the install actions can light up. */
  onUrlChange: (url: string) => void
}

export function SkillsMarketplace({ onUrlChange }: SkillsMarketplaceProps): React.JSX.Element {
  useEffect(() => {
    onUrlChange(SKILLS_MARKETPLACE_URL)
  }, [onUrlChange])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <p className="text-muted-foreground text-sm">
          {translate(
            'auto.components.skills.SkillsMarketplace.chromeSurface',
            'The marketplace opens in Chrome so it can use your existing browser session.'
          )}
        </p>
        <Button
          type="button"
          onClick={() => void shellClient.shell.openUrl(SKILLS_MARKETPLACE_URL)}
        >
          {translate('auto.components.skills.SkillsMarketplace.open', 'Open skills marketplace')}
        </Button>
      </div>
    </div>
  )
}

export type SkillsMarketplaceActionsProps = {
  /** The skill the guest is currently showing, or null off a skill page. */
  installTarget: SkillInstallRequest | null
  onInstall: (request: SkillInstallRequest) => void
}

export function SkillsMarketplaceActions({
  installTarget,
  onInstall
}: SkillsMarketplaceActionsProps): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onInstall({ source: '', skillName: '' })}
      >
        {translate(
          'auto.components.skills.SkillsMarketplace.installFromSource',
          'Install from source'
        )}
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={!installTarget}
        onClick={() => {
          if (installTarget) {
            onInstall(installTarget)
          }
        }}
      >
        <DownloadSimple className="size-3.5" />
        {translate('auto.components.skills.SkillsMarketplace.installCurrent', 'Install this skill')}
      </Button>
    </div>
  )
}
