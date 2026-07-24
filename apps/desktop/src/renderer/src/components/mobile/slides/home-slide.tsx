import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

import { cn } from '../../../lib/class-names'
import { ClaudeIcon, OpenAIIcon } from '../../status-bar/icons'
import { mobileHomePreviewStyles } from '../mobile-home-preview-tailwind'
import { mobilePageStyles } from '../mobile-page-tailwind'

export function HomeSlide({ tapping }: { tapping: boolean }): React.JSX.Element {
  return (
    <div className={mobileHomePreviewStyles.deviceScreen}>
      <div className={mobileHomePreviewStyles.topbar}>
        <div className={mobileHomePreviewStyles.brand}>
          <YiruLogo />
          <span className={mobileHomePreviewStyles.brandName}>
            {translate('auto.components.mobile.slides.HomeSlide.5d94e8ddcc', 'Yiru')}
          </span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          type="button"
          className={cn(
            'p-0 h-auto border-0 focus-visible:bg-accent',
            mobileHomePreviewStyles.iconButton
          )}
          aria-label={translate('auto.components.mobile.slides.HomeSlide.af761a0c0d', 'Settings')}
        >
          <SettingsIcon />
        </Button>
      </div>

      <div className={mobileHomePreviewStyles.scrollRegion}>
        <div className={mobileHomePreviewStyles.greeting}>
          <div className={mobileHomePreviewStyles.greetingTitle}>
            {translate('auto.components.mobile.slides.HomeSlide.c0e2e9dcd9', 'Welcome back')}
          </div>
        </div>

        <div className={mobileHomePreviewStyles.statRow}>
          <Stat
            value="1,284"
            label={translate(
              'auto.components.mobile.slides.HomeSlide.00a6903322',
              'Agents spawned'
            )}
          />
          <Stat
            value="142h"
            label={translate('auto.components.mobile.slides.HomeSlide.4a40af029b', 'Agent time')}
          />
          <Stat
            value="96"
            label={translate('auto.components.mobile.slides.HomeSlide.156db8a68a', 'PRs created')}
          />
        </div>

        <div className={mobileHomePreviewStyles.sectionLabel}>
          {translate('auto.components.mobile.slides.HomeSlide.2f1a1d10c4', 'Desktops')}
        </div>
        <div className={cn(mobileHomePreviewStyles.hostCard, tapping && mobilePageStyles.tapping)}>
          <div className={mobileHomePreviewStyles.hostIcon}>
            <DesktopIcon />
          </div>
          <div className={mobileHomePreviewStyles.hostMain}>
            <div className={mobileHomePreviewStyles.hostName}>
              {translate('auto.components.mobile.slides.HomeSlide.19c212e25e', 'MacBook Pro')}
            </div>
            <div className={mobileHomePreviewStyles.hostMeta}>
              <span
                className={cn(
                  mobileHomePreviewStyles.statusDot,
                  mobileHomePreviewStyles.statusGreen
                )}
              />
              <span>
                {translate(
                  'auto.components.mobile.slides.HomeSlide.0bc1881bc4',
                  'Connected · 40 worktrees · 5 active'
                )}
              </span>
            </div>
          </div>
          <div className={mobileHomePreviewStyles.chevron}>
            <ChevronIcon />
          </div>
        </div>
        <div className={mobileHomePreviewStyles.hostCard}>
          <div
            className={cn(mobileHomePreviewStyles.hostIcon, mobileHomePreviewStyles.hostIconDim)}
          >
            <DesktopIcon />
          </div>
          <div className={mobileHomePreviewStyles.hostMain}>
            <div
              className={cn(mobileHomePreviewStyles.hostName, mobileHomePreviewStyles.hostNameDim)}
            >
              {translate('auto.components.mobile.slides.HomeSlide.091355da3d', 'M1 Mini · home')}
            </div>
            <div className={mobileHomePreviewStyles.hostMeta}>
              <span
                className={cn(
                  mobileHomePreviewStyles.statusDot,
                  mobileHomePreviewStyles.statusMuted
                )}
              />
              <span>
                {translate('auto.components.mobile.slides.HomeSlide.cf3f98fa3f', 'Disconnected')}
              </span>
            </div>
          </div>
          <div className={mobileHomePreviewStyles.chevron}>
            <ChevronIcon />
          </div>
        </div>

        <div className={`${mobileHomePreviewStyles.sectionLabel} mt-3.5`}>
          {translate('auto.components.mobile.slides.HomeSlide.c791677f2f', 'Resume')}
        </div>
        <div className={mobileHomePreviewStyles.resumeCard}>
          <div className={mobileHomePreviewStyles.resumeIcon}>
            <ResumeIcon />
          </div>
          <div className={mobileHomePreviewStyles.hostMain}>
            <div className={mobileHomePreviewStyles.resumeTitle}>
              {translate('auto.components.mobile.slides.HomeSlide.25d6e8a491', 'feat/mobile-page')}
            </div>
            <div className={mobileHomePreviewStyles.resumeSub}>
              <span className={`${mobileHomePreviewStyles.repoDot} bg-blue-500`} />
              <span>
                {translate(
                  'auto.components.mobile.slides.HomeSlide.d33d7a9c29',
                  'yiru&nbsp;&nbsp;·&nbsp;&nbsp;feat/mobile-page'
                )}
              </span>
            </div>
          </div>
          <div className={mobileHomePreviewStyles.chevron}>
            <ChevronIcon />
          </div>
        </div>

        <div className={`${mobileHomePreviewStyles.sectionLabel} mt-3.5`}>
          {translate('auto.components.mobile.slides.HomeSlide.0b00c98506', 'Quick Actions')}
        </div>
        <div className={mobileHomePreviewStyles.quickActions}>
          <div className={mobileHomePreviewStyles.quickAction}>
            <div className={mobileHomePreviewStyles.quickActionIcon}>
              <QrSmallIcon />
            </div>
            <div className={mobileHomePreviewStyles.quickActionLabel}>
              {translate('auto.components.mobile.slides.HomeSlide.4405f3c440', 'Pair Desktop')}
            </div>
          </div>
          <div className={mobileHomePreviewStyles.quickAction}>
            <div className={mobileHomePreviewStyles.quickActionIcon}>
              <PlusIcon />
            </div>
            <div className={mobileHomePreviewStyles.quickActionLabel}>
              {translate('auto.components.mobile.slides.HomeSlide.e27fdaee51', 'New Workspace')}
            </div>
          </div>
        </div>

        <div className={`${mobileHomePreviewStyles.sectionLabel} mt-3.5`}>
          {translate('auto.components.mobile.slides.HomeSlide.8a350a4784', 'Account usage')}
        </div>
        <div className={mobileHomePreviewStyles.accountsCard}>
          <AccountRow
            icon={<ClaudeIcon size={18} />}
            email="claude@yiru.ai"
            sessionPct={42}
            weekPct={18}
          />
          <AccountRow
            icon={<OpenAIIcon size={18} />}
            email="codex@yiru.ai"
            sessionPct={67}
            weekPct={31}
          />
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <div className={mobileHomePreviewStyles.statCard}>
      <div className={mobileHomePreviewStyles.statValue}>{value}</div>
      <div className={mobileHomePreviewStyles.statLabel}>{label}</div>
    </div>
  )
}

function AccountRow({
  icon,
  email,
  sessionPct,
  weekPct
}: {
  icon: React.ReactNode
  email: string
  sessionPct: number
  weekPct: number
}): React.JSX.Element {
  return (
    <div className={mobileHomePreviewStyles.accountsRow}>
      <div className={mobileHomePreviewStyles.accountsIcon}>{icon}</div>
      <div className={mobileHomePreviewStyles.accountsInfo}>
        <div className={mobileHomePreviewStyles.accountsEmail}>{email}</div>
        <div className={mobileHomePreviewStyles.accountsBars}>
          <UsageBar
            label={translate('auto.components.mobile.slides.HomeSlide.a3d5476811', '5h')}
            pct={sessionPct}
          />
          <UsageBar
            label={translate('auto.components.mobile.slides.HomeSlide.a7d9e2c44d', '7d')}
            pct={weekPct}
          />
        </div>
      </div>
    </div>
  )
}

function UsageBar({ label, pct }: { label: string; pct: number }): React.JSX.Element {
  return (
    <div className={mobileHomePreviewStyles.usageBar}>
      <div className={mobileHomePreviewStyles.usageBarLabel}>{label}</div>
      <div className={mobileHomePreviewStyles.usageBarTrack}>
        <div className={mobileHomePreviewStyles.usageBarFill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function YiruLogo(): React.JSX.Element {
  return (
    <svg
      className={mobileHomePreviewStyles.logo}
      viewBox="0 0 612 621"
      fill="currentColor"
      aria-hidden
    >
      <path d="M0 0h118l188 192L494 0h118v62L374 304v317H241V304L0 62Z" />
    </svg>
  )
}

function SettingsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

function DesktopIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  )
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function ResumeIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="m4 17 6-6-6-6" />
      <path d="M12 19h8" />
    </svg>
  )
}

function QrSmallIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="3" height="3" />
      <rect x="18" y="14" width="3" height="3" />
      <rect x="14" y="18" width="3" height="3" />
      <rect x="18" y="18" width="3" height="3" />
    </svg>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}
