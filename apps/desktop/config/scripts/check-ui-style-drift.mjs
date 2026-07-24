import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const RENDERER_ROOT = 'src/renderer/src'
const UI_ROOT = path.join(RENDERER_ROOT, 'components/ui')

const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', '.git'])

/** Paths (posix, relative to apps/desktop) that may keep native hosts. */
const NATIVE_BUTTON_ALLOWLIST = new Set([
  // Why: Base UI Switch requires a native button host element.
  'src/renderer/src/components/ui/switch.tsx'
])

/**
 * Proven IME / editor / canvas contracts that must stay on native form tags.
 * Each path must keep an in-file Why comment explaining the exception.
 */
const NATIVE_FORM_ALLOWLIST = new Set([
  'src/renderer/src/components/browser-pane/markup/markup-overlay.tsx',
  'src/renderer/src/components/editor/rich-markdown-code-block.tsx',
  'src/renderer/src/components/native-chat/native-chat-composer-field.tsx'
])

/**
 * Brand art, theme previews, modal scrims, and device chrome that intentionally
 * use black/white alpha (not interactive accent washes).
 */
const BLACK_WHITE_ALPHA_ALLOWLIST = new Set([
  'src/renderer/src/components/onboarding/theme-chrome-preview.tsx',
  'src/renderer/src/components/onboarding/onboarding-flow.tsx',
  'src/renderer/src/components/onboarding/onboarding-skip-confirmation-dialog.tsx',
  'src/renderer/src/components/worktree-jump-palette.tsx',
  'src/renderer/src/components/emulator-pane/emulator-phone-hardware-buttons.tsx',
  'src/renderer/src/components/settings/mobile-pairing-qr-section.tsx',
  'src/renderer/src/components/browser-pane/grab-confirmation-sheet.tsx'
])

const PRIVATE_STYLE_IMPORT_RE =
  /from\s+['"]@\/components\/ui\/(?:floating-surface-styles|menu-item-styles|popover-content-ref)['"]/
/** Matches Tailwind black/white alpha utilities including fractional forms. */
const BLACK_WHITE_ALPHA_RE = /\b(?:bg|text|border)-(?:black|white)\/(?:\d+|\[[^\]]+\])/
/** Matches any rounded-* utility, including directional and arbitrary values. */
const ROUNDED_RE = /\brounded(?:-[a-z0-9[\]%./-]+)?\b/
const NATIVE_BUTTON_RE = /<\s*button(?:\s|>)/
const NATIVE_FORM_RE = /<\s*(?:input|textarea|select)(?:\s|>)/
/**
 * Clearest call-site Button anti-patterns that quiet/ghost already own.
 * Broader className hygiene is a follow-up ratchet — warn only for now.
 */
const BUTTON_QUIET_STACK_RE =
  /<Button\b[^>]*\bclassName=\{?(?:cn\()?[`'"][^`'"]*text-muted-foreground[^`'"]*hover:bg-accent[^`'"]*[`'"]/
const BUTTON_SIDEBAR_HOVER_RE = /<Button\b[^>]*hover:bg-sidebar-accent/

/**
 * @param {string} root
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function listTsxFiles(root, dir) {
  const absolute = path.join(root, dir)
  /** @type {string[]} */
  const out = []
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue
      }
      const next = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) {
          continue
        }
        await walk(next)
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.tsx')) {
        out.push(path.relative(root, next).split(path.sep).join('/'))
      }
    }
  }
  await walk(absolute)
  return out.sort()
}

/**
 * Strip block and line comments so regex checks do not trip on docs.
 * @param {string} source
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * @param {string} filePath
 * @param {string} source
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function findUiStyleDrift(filePath, source) {
  /** @type {string[]} */
  const errors = []
  /** @type {string[]} */
  const warnings = []
  const code = stripComments(source)
  const underUi = filePath.startsWith('src/renderer/src/components/ui/')

  if (!underUi && PRIVATE_STYLE_IMPORT_RE.test(code)) {
    errors.push(
      'imports private ui style module; screens must import rendered primitives only (see docs/style-guide.md)'
    )
  }

  if (!BLACK_WHITE_ALPHA_ALLOWLIST.has(filePath) && BLACK_WHITE_ALPHA_RE.test(code)) {
    errors.push(
      'uses bg/text/border-black|white/N; prefer accent/muted/border tokens (see docs/style-guide.md)'
    )
  }

  // Why: global --radius:0 makes rounded-* no-ops; new call sites must not reintroduce them.
  // Allow the ui/ layer during CVA cleanup; feature TSX must stay clean.
  if (!underUi && ROUNDED_RE.test(code)) {
    errors.push(
      'uses rounded-* class utilities; Yiru is rectilinear — omit them (see docs/style-guide.md)'
    )
  }

  if (!NATIVE_BUTTON_ALLOWLIST.has(filePath) && !underUi && NATIVE_BUTTON_RE.test(code)) {
    errors.push(
      'uses native <button>; use Button from @/components/ui/button (see docs/style-guide.md)'
    )
  }

  if (!NATIVE_FORM_ALLOWLIST.has(filePath) && !underUi && NATIVE_FORM_RE.test(code)) {
    errors.push(
      'uses native <input>/<textarea>/<select>; use Input/Textarea/Select/Checkbox/Slider/Switch from @/components/ui (or add a Why allowlist entry)'
    )
  }

  if (!underUi && (BUTTON_QUIET_STACK_RE.test(code) || BUTTON_SIDEBAR_HOVER_RE.test(code))) {
    warnings.push(
      'Button className looks like variant-owned chrome (quiet stack or sidebar-accent hover); prefer variant="quiet"/ghost (see docs/style-guide.md)'
    )
  }

  return { errors, warnings }
}

/**
 * @param {string} [root]
 */
export async function main(root = process.cwd()) {
  const files = await listTsxFiles(root, RENDERER_ROOT)
  /** @type {{ file: string, errors: string[], warnings: string[] }[]} */
  const failures = []
  /** @type {{ file: string, warnings: string[] }[]} */
  const warns = []

  for (const file of files) {
    const source = await fs.readFile(path.join(root, file), 'utf8')
    const { errors, warnings } = findUiStyleDrift(file, source)
    if (errors.length > 0) {
      failures.push({ file, errors, warnings })
    } else if (warnings.length > 0) {
      warns.push({ file, warnings })
    }
  }

  void UI_ROOT

  for (const warning of warns) {
    console.warn(`\n${warning.file}`)
    for (const issue of warning.warnings) {
      console.warn(`  ~ ${issue}`)
    }
  }
  if (warns.length > 0) {
    console.warn(
      `\n${warns.length} file(s) with Button className warnings (non-blocking). Prefer variant="quiet".`
    )
  }

  if (failures.length === 0) {
    return 0
  }

  console.error('UI style drift detected (ui-first style guide).')
  for (const failure of failures) {
    console.error(`\n${failure.file}`)
    for (const issue of failure.errors) {
      console.error(`  - ${issue}`)
    }
  }
  console.error('\nSee docs/style-guide.md (First principle: reuse @/components/ui).')
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main())
}
