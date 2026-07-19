import { ClaudeIcon, OpenAIIcon } from '../../status-bar/icons'
import { cn } from '../../../lib/class-names'
import { translate } from '@/i18n/i18n'

export function HomeSlide({ tapping }: { tapping: boolean }): React.JSX.Element {
  return (
    <div className="mp-device-screen">
      <div className="mp-app-topbar">
        <div className="mp-app-brand">
          <YiruLogo />
          <span className="mp-app-brand-name">
            {translate('auto.components.mobile.slides.HomeSlide.5d94e8ddcc', 'Yiru')}
          </span>
        </div>
        <button
          type="button"
          className="mp-icon-button"
          aria-label={translate('auto.components.mobile.slides.HomeSlide.af761a0c0d', 'Settings')}
        >
          <SettingsIcon />
        </button>
      </div>

      <div className="mp-scroll-region">
        <div className="mp-greeting">
          <div className="mp-greeting-title">
            {translate('auto.components.mobile.slides.HomeSlide.c0e2e9dcd9', 'Welcome back')}
          </div>
        </div>

        <div className="mp-stat-row">
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

        <div className="mp-section-label">
          {translate('auto.components.mobile.slides.HomeSlide.2f1a1d10c4', 'Desktops')}
        </div>
        <div className={cn('mp-host-card', tapping && 'is-tapping')}>
          <div className="mp-host-icon">
            <DesktopIcon />
          </div>
          <div className="mp-host-main">
            <div className="mp-host-name">
              {translate('auto.components.mobile.slides.HomeSlide.19c212e25e', 'MacBook Pro')}
            </div>
            <div className="mp-host-meta">
              <span className="mp-status-dot is-green" />
              <span>
                {translate(
                  'auto.components.mobile.slides.HomeSlide.0bc1881bc4',
                  'Connected · 40 worktrees · 5 active'
                )}
              </span>
            </div>
          </div>
          <div className="mp-chevron-right">
            <ChevronIcon />
          </div>
        </div>
        <div className="mp-host-card">
          <div className="mp-host-icon is-dim">
            <DesktopIcon />
          </div>
          <div className="mp-host-main">
            <div className="mp-host-name is-dim">
              {translate('auto.components.mobile.slides.HomeSlide.091355da3d', 'M1 Mini · home')}
            </div>
            <div className="mp-host-meta">
              <span className="mp-status-dot is-muted" />
              <span>
                {translate('auto.components.mobile.slides.HomeSlide.cf3f98fa3f', 'Disconnected')}
              </span>
            </div>
          </div>
          <div className="mp-chevron-right">
            <ChevronIcon />
          </div>
        </div>

        <div className="mp-section-label" style={{ marginTop: 14 }}>
          {translate('auto.components.mobile.slides.HomeSlide.c791677f2f', 'Resume')}
        </div>
        <div className="mp-resume-card">
          <div className="mp-resume-icon">
            <ResumeIcon />
          </div>
          <div className="mp-host-main">
            <div className="mp-resume-title">
              {translate('auto.components.mobile.slides.HomeSlide.25d6e8a491', 'feat/mobile-page')}
            </div>
            <div className="mp-resume-sub">
              <span className="mp-repo-dot" style={{ background: '#3b82f6' }} />
              <span>
                {translate(
                  'auto.components.mobile.slides.HomeSlide.d33d7a9c29',
                  'yiru&nbsp;&nbsp;·&nbsp;&nbsp;feat/mobile-page'
                )}
              </span>
            </div>
          </div>
          <div className="mp-chevron-right">
            <ChevronIcon />
          </div>
        </div>

        <div className="mp-section-label" style={{ marginTop: 14 }}>
          {translate('auto.components.mobile.slides.HomeSlide.0b00c98506', 'Quick Actions')}
        </div>
        <div className="mp-quick-actions">
          <div className="mp-quick-action">
            <div className="mp-quick-action-icon">
              <QrSmallIcon />
            </div>
            <div className="mp-quick-action-label">
              {translate('auto.components.mobile.slides.HomeSlide.4405f3c440', 'Pair Desktop')}
            </div>
          </div>
          <div className="mp-quick-action">
            <div className="mp-quick-action-icon">
              <PlusIcon />
            </div>
            <div className="mp-quick-action-label">
              {translate('auto.components.mobile.slides.HomeSlide.e27fdaee51', 'New Workspace')}
            </div>
          </div>
        </div>

        <div className="mp-section-label" style={{ marginTop: 14 }}>
          {translate('auto.components.mobile.slides.HomeSlide.8a350a4784', 'Account usage')}
        </div>
        <div className="mp-accounts-card">
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
    <div className="mp-stat-card">
      <div className="mp-stat-value">{value}</div>
      <div className="mp-stat-label">{label}</div>
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
    <div className="mp-accounts-row">
      <div className="mp-accounts-icon">{icon}</div>
      <div className="mp-accounts-info">
        <div className="mp-accounts-email">{email}</div>
        <div className="mp-accounts-bars">
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
    <div className="mp-usage-bar">
      <div className="mp-usage-bar-label">{label}</div>
      <div className="mp-usage-bar-track">
        <div className="mp-usage-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function YiruLogo(): React.JSX.Element {
  return (
    <svg className="mp-yiru-logo" viewBox="0 0 612 621" fill="currentColor" aria-hidden>
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
