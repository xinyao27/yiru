import { ArrowRight } from '@/components/regular-icons'
import { translate } from '@/i18n/i18n'

import { AndroidLogo, IosBrandIcon } from './mobile-brand-icons'
import { mobilePageStyles } from './mobile-page-tailwind'

export function HeroIntro({ onStart }: { onStart: () => void }): React.JSX.Element {
  return (
    <div className={mobilePageStyles.introShell}>
      <div className={mobilePageStyles.eyebrowRow}>
        <span className={mobilePageStyles.eyebrow}>
          {translate('auto.components.mobile.MobileHero.5410d55d79', 'Yiru Mobile')}
        </span>
      </div>
      <h1 className={mobilePageStyles.heading}>
        {translate(
          'auto.components.mobile.MobileHero.cd4e5e816f',
          'Your workspaces, in your pocket.'
        )}
      </h1>
      <p className={mobilePageStyles.lead}>
        {translate(
          'auto.components.mobile.MobileHero.b4ccce5cb7',
          "Control Yiru from your phone. Check on agents, review changes, and kick off tasks while you're away from your desk."
        )}
      </p>
      <div
        className={mobilePageStyles.platformBadges}
        aria-label={translate(
          'auto.components.mobile.MobileHero.ec0607bf66',
          'Supported mobile platforms'
        )}
      >
        <span className={mobilePageStyles.platformLabel}>
          {translate('auto.components.mobile.MobileHero.da1d5e5ed0', 'Available on')}
        </span>
        <span className={mobilePageStyles.platformBadge}>
          <IosBrandIcon />
          {translate('auto.components.mobile.MobileHero.711e6f4b47', 'iOS')}
        </span>
        <span className={mobilePageStyles.platformBadge}>
          <AndroidLogo />
          {translate('auto.components.mobile.MobileHero.ac1eb64952', 'Android')}
        </span>
      </div>
      <div className={mobilePageStyles.ctaRow}>
        <button
          type="button"
          className={`${mobilePageStyles.primaryAction} ${mobilePageStyles.flowPrimaryAction}`}
          onClick={onStart}
        >
          {translate('auto.components.mobile.MobileHero.10d27b4cba', 'Get started')}
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
