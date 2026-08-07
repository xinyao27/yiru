import { DownloadMenu } from './chrome/download-menu'
import { ThemeToggle } from './chrome/theme-toggle'
import { siteLinks } from './site-links'
import { Capabilities } from './ui/capabilities'
import { Demo } from './ui/demo/demo'
import { Faq } from './ui/faq/list'

// Why: the architecture is a choice rather than a second download, because
// browsers report "Intel Mac OS X" even on Apple Silicon — detecting it would
// hand a lot of people the wrong build. Linux and Windows builds exist in the
// release but are not offered here; the footer's Releases link reaches them.
const macBuilds = [
  { label: 'Apple Silicon', href: siteLinks.downloadMac },
  { label: 'Intel', href: siteLinks.downloadMacIntel }
]

const footerLinks = [
  { label: 'GitHub', href: siteLinks.github },
  { label: 'Releases', href: siteLinks.releases },
  { label: 'Issues', href: siteLinks.issues }
]

const linkClasses =
  'decoration-copy/30 hover:text-label hover:decoration-label underline underline-offset-[3px] transition-colors'

export function App(): React.JSX.Element {
  return (
    <div className="bg-page min-h-screen">
      <div className="mx-auto flex max-w-[1120px] items-start justify-center px-4 sm:px-6">
        {/* Why: one uniform 24px gap between blocks and 12px inside pairs — the
            whole vertical rhythm, inherited type set once here.

            min-w-0 is load-bearing. A flex item defaults to min-width:auto, so
            without it this column is forced to the demo's min-content width and
            grows past a phone's viewport, cutting the prose off at the right edge.
            The demo keeps its own scroll track — see ui/demo/demo.tsx. */}
        <main className="border-hairline text-copy flex min-h-screen w-full max-w-[1120px] min-w-0 flex-col gap-7 px-6 pt-4 pb-20 text-[16px] leading-[26px] sm:border-x sm:px-18">
          {/* Why: the tagline sits inside the h1 rather than in a sibling p, so the
              one heading a crawler weighs carries the category term as well as the
              brand. The two lines render exactly as the split pair did. */}
          <h1 className="text-ink flex flex-col gap-3 pt-24 text-[26px] leading-[1.2] font-semibold">
            Yiru
            <span className="text-copy max-w-[620px] text-[16px] leading-[26px] font-normal">
              The AI agent editor IDE — run coding agents anywhere your code lives.
            </span>
          </h1>

          <p className="max-w-[620px]">
            Yiru runs Claude Code, Codex, and any CLI agent in isolated git worktrees — on your Mac,
            a WSL distro, or an SSH box. Review the evidence and merge from your desk or your phone.
          </p>

          <div className="flex flex-col gap-3">
            <p className="max-w-[620px]">Download:</p>
            <div className="border-hairline rounded-card flex w-full items-center justify-between gap-3 border px-4 py-3">
              <div className="flex min-w-0 items-center gap-5 font-mono text-[14px]">
                <DownloadMenu label="macOS" options={macBuilds} />
                <a
                  href={siteLinks.testflight}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink hover:text-accent transition-colors"
                >
                  iOS
                </a>
              </div>
              <a
                href={siteLinks.license}
                target="_blank"
                rel="noreferrer"
                className="text-faint hover:text-ink shrink-0 font-mono text-[12px] transition-colors"
              >
                MIT
              </a>
            </div>
          </div>

          <Demo />

          <Capabilities />

          <Faq />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {footerLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className={linkClasses}
              >
                {link.label}
              </a>
            ))}
            <span className="ml-auto">
              <ThemeToggle />
            </span>
          </div>
        </main>
      </div>
    </div>
  )
}
