import { ClaudeIcon, OpenAIIcon } from '../../status-bar/icons'
import { cn } from '../../../lib/class-names'
import { mobileHomePreviewStyles } from '../mobile-home-preview-tailwind'
import { mobilePageStyles } from '../mobile-page-tailwind'
import { translate } from '@/i18n/i18n'

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
        <button
          type="button"
          className={mobileHomePreviewStyles.iconButton}
          aria-label={translate('auto.components.mobile.slides.HomeSlide.af761a0c0d', 'Settings')}
        >
          <SettingsIcon />
        </button>
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

        <div className={`${mobileHomePreviewStyles.sectionLabel} mt-2.5`}>
          {translate('auto.components.mobile.slides.HomeSlide.a4c3f7b7aa', 'Tasks')}
        </div>
        <div className={mobileHomePreviewStyles.taskCard}>
          <div className={mobileHomePreviewStyles.taskIcon}>
            <ListTodoIcon />
          </div>
          <div className={mobileHomePreviewStyles.hostMain}>
            <div className={mobileHomePreviewStyles.taskTitle}>
              {translate('auto.components.mobile.slides.HomeSlide.a4c3f7b7aa', 'Tasks')}
            </div>
            <div className={mobileHomePreviewStyles.taskSubtitle}>
              {translate('auto.components.mobile.slides.HomeSlide.d047197480', 'GitHub · Linear')}
            </div>
          </div>
          <div
            className={mobileHomePreviewStyles.taskProviders}
            aria-label={translate(
              'auto.components.mobile.slides.HomeSlide.0bad5b07c8',
              'GitHub and Linear'
            )}
          >
            <div className={mobileHomePreviewStyles.taskProviderButton}>
              <GithubIcon />
            </div>
            <div className={mobileHomePreviewStyles.taskProviderButton}>
              <LinearIcon />
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

function ListTodoIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="m3 17 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </svg>
  )
}

function GithubIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  )
}

function LinearIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden>
      <path d="M1.225 61.523c-.187-.738.708-1.235 1.246-.697l36.703 36.703c.538.538.041 1.433-.697 1.246C20.6 94.16 5.84 79.4 1.225 61.523ZM.002 46.811a.997.997 0 0 0 .291.749l52.147 52.147a.998.998 0 0 0 .749.291 50.328 50.328 0 0 0 9.235-1.119c.667-.149.904-.972.422-1.454L1.575 37.154c-.482-.482-1.305-.245-1.454.422A50.328 50.328 0 0 0 .002 46.81Zm4.528-18.34a.998.998 0 0 0 .195 1.144l64.66 64.66a.998.998 0 0 0 1.144.195 50.45 50.45 0 0 0 5.913-3.46.999.999 0 0 0 .14-1.518L9.51 22.418a.999.999 0 0 0-1.518.14 50.45 50.45 0 0 0-3.46 5.913Zm10.435-13.075a.999.999 0 0 0 .002 1.41l68.226 68.226a.999.999 0 0 0 1.41.002c19.292-19.477 19.234-50.97-.176-70.378-19.410-19.410-50.901-19.468-70.378-.176-1.061 1.044.916 1.916.916 1.916Z" />
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
