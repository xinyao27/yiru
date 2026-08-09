import {
  LOCALE_KEY_OVERRIDES,
  LOCALE_VALUE_OVERRIDES,
  SEARCH_KEYWORD_OVERRIDES
} from './locale-translation-overrides.mjs'
import {
  CJK_LATIN_SPACED_TERMS,
  isScreenCursorContext,
  LOCALE_PHRASE_FIXES
} from './locale-translation-repairs.mjs'

export {
  LOCALE_KEY_OVERRIDES,
  LOCALE_VALUE_OVERRIDES,
  SEARCH_KEYWORD_OVERRIDES
} from './locale-translation-overrides.mjs'
export { LOCALE_PHRASE_FIXES } from './locale-translation-repairs.mjs'

const AGENT_CATALOG_PREFIX = 'auto.lib.agent.catalog.'
const OPEN_IN_APP_CATALOG_PREFIX = 'auto.lib.open.in.app.catalog.'

// Why: product names and agent labels stay Latin — MT reads them as common words (Codex→copy, Gemini→zodiac).
export const ENGLISH_ONLY_KEY_PREFIXES = [AGENT_CATALOG_PREFIX, OPEN_IN_APP_CATALOG_PREFIX]

export const NEVER_TRANSLATE_VALUES = new Set([
  'Agent',
  'Agents',
  'Aider',
  'Amp',
  'Android',
  'Antigravity',
  'Auggie',
  'Autohand Code',
  'Charm',
  'Claude',
  'Claude Agent Teams',
  'Cline',
  'Codebuff',
  'Codex',
  'Command Code',
  'Continue',
  'Cursor',
  'Droid',
  'Devin',
  'Gemini',
  'Git',
  'Git Bash',
  'GitHub Copilot',
  'GitLab',
  'Goose',
  'Grok',
  'Hermes',
  'Kilocode',
  'Kimi',
  'Kiro',
  'Mistral Vibe',
  'OMP',
  'OpenClaude',
  'OpenClaw',
  'OpenCode',
  'OpenCode Go',
  'Yiru',
  'Pi',
  'PostHog',
  'Qwen Code',
  'Repo',
  'Repos',
  'Rovo Dev',
  'Commit',
  'Commits',
  'Markdown',
  'Terminal',
  'Terminals',
  'VS Code',
  'Warp',
  'Zed',
  'agent',
  'agents',
  'android',
  'codex',
  'commit',
  'commits',
  'gemini',
  'claude',
  'markdown',
  'repo',
  'repos',
  'terminal',
  'terminals',
  'gh',
  'idle',
  'anthropic',
  'Discord',
  'WSL',
  'wsl',
  'darwin',
  'Nautilus',
  'GitHub',
  'no_proxy',
  'Beta',
  // Round 6: product/tool names, language names, and code tokens that machine
  // translation wrongly localized (e.g. tailscale→尾鱗, Swift→迅速, yarn→糸).
  'Tailscale',
  'tailscale',
  'Ghostty',
  'ghostty',
  'pwsh',
  'yarn',
  'Kagi',
  'kagi',
  'Bitbucket',
  'bitbucket',
  'GNOME',
  'gnome',
  'iCloud',
  'icloud',
  'ripgrep',
  'PowerShell',
  'powershell',
  'TypeScript',
  'typescript',
  'Mermaid',
  'mermaid',
  'Swift',
  'swift',
  'Rust',
  'rust',
  'Java',
  'java',
  'Go',
  'Python',
  'python',
  'Kotlin',
  'kotlin',
  'Ruby',
  'ruby',
  'Bash',
  'bash',
  'GraphQL',
  'graphql',
  'iOS',
  'iPhone',
  'iPad',
  'ide',
  'IDE',
  'ui',
  'UI',
  'calt',
  'ai',
  'AI',
  'ci',
  'CI',
  'REST',
  'rest',
  'YAML',
  'yaml',
  'yml',
  'XML',
  'SQL',
  'CSS',
  'Token',
  'token',
  'HTTP/1.1',
  'HTTP/2',
  'true',
  'false',
  '/home/user',
  '/home/user/project',
  '/path/to/destination',
  'PLAN.md',
  'feat/mobile-page',
  'sk-...',
  'main',
  'master',
  'HEAD',
  'lint',
  'MD',
  '/home/user/projects',
  'Claude Code'
])

export const BRAND_MISTRANSLATIONS = {
  zh: {
    Codex: ['法典'],
    Gemini: ['双子座'],
    Claude: ['克洛德', '克劳德'],
    Grok: ['格罗克'],
    Yiru: ['虎鲸', '逆戟鲸'],
    Cursor: ['光标'],
    OpenCode: ['开放代码'],
    OpenClaw: ['开爪'],
    OpenClaude: ['开放克劳德'],
    Antigravity: ['反重力'],
    Continue: ['继续'],
    Charm: ['魅力'],
    Goose: ['鹅'],
    Pi: ['圆周率'],
    Droid: ['机器人'],
    'GitHub Copilot': ['GitHub 副驾驶', '副驾驶'],
    Bitbucket: ['位桶'],
    Tailscale: ['尾鳞', '尾鱗'],
    Agent: ['代理'],
    Agents: ['代理'],
    agent: ['代理'],
    agents: ['代理'],
    Commit: ['提交'],
    Commits: ['提交'],
    commit: ['提交'],
    commits: ['提交'],
    Markdown: ['降价'],
    markdown: ['降价'],
    Repo: ['存储库', '仓库', '回购协议', '回购'],
    Repos: ['存储库', '仓库', '回购协议', '回购'],
    repo: ['存储库', '仓库', '回购协议', '回购'],
    repos: ['存储库', '仓库', '回购协议', '回购'],
    Terminal: ['终端', '端子'],
    Terminals: ['终端', '端子'],
    terminal: ['终端', '端子'],
    terminals: ['终端', '端子'],
    Bash: ['重击'],
    PowerShell: ['电源外壳'],
    REST: ['休息'],
    HEAD: ['头'],
    Swift: ['迅速'],
    Rust: ['锈'],
    'Claude Code': ['Claude·科德'],
    'Git AI Author': ['Git AI 作者']
  }
}

export const NATIVE_PICKER_LABELS = {
  zh: { chinese: '中文（简体）' }
}

const CJK_LATIN_SPACED_TERM_PATTERN = CJK_LATIN_SPACED_TERMS.join('|')

export function isEnglishOnlyKey(key) {
  return ENGLISH_ONLY_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

export function shouldPreserveEnglishValue(enValue, key = '') {
  if (!enValue?.trim()) {
    return true
  }
  if (/^https?:\/\//.test(enValue) || enValue.startsWith('yiru://')) {
    return true
  }
  if (isEnglishOnlyKey(key)) {
    return true
  }
  return NEVER_TRANSLATE_VALUES.has(enValue)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function includesPreservedLatinTerm(value, term) {
  if (!/^[A-Za-z_]+$/.test(term)) {
    return value.includes(term)
  }
  return new RegExp(`(^|[^A-Za-z_])${escapeRegExp(term)}($|[^A-Za-z_])`).test(value)
}

function applyBrandMistranslationFixes(enValue, localeValue, locale, key = '') {
  let result = localeValue
  const mistranslations = BRAND_MISTRANSLATIONS[locale] ?? {}

  for (const [brand, wrongForms] of Object.entries(mistranslations).sort(
    ([left], [right]) => right.length - left.length
  )) {
    if (!includesPreservedLatinTerm(enValue, brand)) {
      continue
    }
    // Why: terminal/theme "Cursor" labels name the on-screen 光标, not the Cursor product.
    if (isScreenCursorContext(brand, enValue, key)) {
      continue
    }
    if (includesPreservedLatinTerm(result, brand)) {
      continue
    }
    for (const wrong of wrongForms) {
      if (!result.includes(wrong)) {
        continue
      }
      // Why: "Copy identifier" legitimately uses 复制 — only swap when English names the brand.
      if (brand === 'Codex' && /\bCopy\b/i.test(enValue)) {
        continue
      }
      result = result.replaceAll(wrong, brand)
    }
  }

  return result
}

function applyCjkLatinTermSpacing(localeValue) {
  // Why: Simplified Chinese copy keeps protected Latin workflow terms readable when MT glues them to native text.
  return localeValue
    .replace(new RegExp(`(${CJK_LATIN_SPACED_TERM_PATTERN})([\\u3400-\\u9fff])`, 'g'), '$1 $2')
    .replace(new RegExp(`([\\u3400-\\u9fff])(${CJK_LATIN_SPACED_TERM_PATTERN})`, 'g'), '$1 $2')
    .replace(
      new RegExp(`(${CJK_LATIN_SPACED_TERM_PATTERN})(${CJK_LATIN_SPACED_TERM_PATTERN})`, 'g'),
      '$1 $2'
    )
}

function phraseFixMatchesEnglish(enValue, fix) {
  // Why: `whenEnMatches` (a RegExp) lets a rule guard on a real token (e.g. /\bPRs?\b/)
  // instead of the looser case-insensitive `whenEnIncludes` substring, so a phrase fix can
  // avoid firing on unrelated English that merely contains the substring (approve, preview).
  if (fix.whenEnMatches) {
    return fix.whenEnMatches.test(enValue)
  }
  return enValue.toLowerCase().includes(fix.whenEnIncludes.toLowerCase())
}

function applyPhraseFixes(enValue, localeValue, locale) {
  let result = localeValue
  for (const fix of LOCALE_PHRASE_FIXES[locale] ?? []) {
    if (!phraseFixMatchesEnglish(enValue, fix)) {
      continue
    }
    result = result.replace(fix.pattern, fix.replacement)
  }
  return result
}

export function repairTranslatedValue({ key, enValue, localeValue, locale }) {
  const keyOverride = LOCALE_KEY_OVERRIDES[key]?.[locale]
  if (keyOverride) {
    // Why: exact key overrides can still carry stale MT output, so glossary repairs remain the final gate.
    let result = applyBrandMistranslationFixes(enValue, keyOverride, locale, key)
    result = applyPhraseFixes(enValue, result, locale)
    if (locale === 'zh') {
      result = applyCjkLatinTermSpacing(result)
    }
    return result
  }

  const valueOverride = LOCALE_VALUE_OVERRIDES[locale]?.[enValue]
  if (valueOverride) {
    let result = applyBrandMistranslationFixes(enValue, valueOverride, locale, key)
    result = applyPhraseFixes(enValue, result, locale)
    if (locale === 'zh') {
      result = applyCjkLatinTermSpacing(result)
    }
    return result
  }

  if (shouldPreserveEnglishValue(enValue, key)) {
    return enValue
  }

  let result = localeValue

  if (key.includes('.search.')) {
    const searchOverride = SEARCH_KEYWORD_OVERRIDES[locale]?.[enValue]
    if (searchOverride) {
      result = searchOverride
    }
  }

  result = applyBrandMistranslationFixes(enValue, result, locale, key)
  result = applyPhraseFixes(enValue, result, locale)
  if (locale === 'zh') {
    result = applyCjkLatinTermSpacing(result)
  }

  if (enValue.includes('yiru://')) {
    result = result.replace(/虎鲸:\/\//g, 'yiru://')
  }

  if (enValue === 'Yiru' || enValue.startsWith('Yiru ')) {
    result = result.replaceAll('虎鲸', 'Yiru').replaceAll('逆戟鲸', 'Yiru')
  }

  return result
}

export function collectStringLeaves(value, prefix = '', leaves = []) {
  if (typeof value === 'string') {
    leaves.push({ key: prefix, value })
    return leaves
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return leaves
  }
  for (const [key, child] of Object.entries(value)) {
    collectStringLeaves(child, prefix ? `${prefix}.${key}` : key, leaves)
  }
  return leaves
}

export function setLeaf(catalog, key, translatedValue) {
  const parts = key.split('.')
  let cursor = catalog
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor = cursor[parts[index]]
  }
  cursor[parts.at(-1)] = translatedValue
}

export function repairCatalog(enCatalog, localeCatalog, locale) {
  const leaves = collectStringLeaves(enCatalog)
  let repaired = 0

  for (const leaf of leaves) {
    const current = leaf.key.split('.').reduce((cursor, part) => cursor?.[part], localeCatalog)
    const next = repairTranslatedValue({
      key: leaf.key,
      enValue: leaf.value,
      localeValue: current,
      locale
    })
    if (next !== current) {
      setLeaf(localeCatalog, leaf.key, next)
      repaired += 1
    }
  }

  if (localeCatalog.settings?.appearance?.language) {
    for (const [labelKey, label] of Object.entries(NATIVE_PICKER_LABELS[locale] ?? {})) {
      if (localeCatalog.settings.appearance.language[labelKey] !== label) {
        localeCatalog.settings.appearance.language[labelKey] = label
        repaired += 1
      }
    }
  }

  if (localeCatalog.menu) {
    if (locale === 'zh') {
      if (localeCatalog.menu.exploreYiru !== '探索 Yiru') {
        localeCatalog.menu.exploreYiru = '探索 Yiru'
        repaired += 1
      }
      if (localeCatalog.menu.gettingStarted !== 'Yiru 入门') {
        localeCatalog.menu.gettingStarted = 'Yiru 入门'
        repaired += 1
      }
    }
  }

  return repaired
}

export function repairCacheMap(cache, locale) {
  let repaired = 0
  for (const [enValue, translated] of cache.entries()) {
    const next = shouldPreserveEnglishValue(enValue)
      ? enValue
      : repairTranslatedValue({
          key: '',
          enValue,
          localeValue: translated,
          locale
        })
    if (next !== translated) {
      cache.set(enValue, next)
      repaired += 1
    }
  }
  return repaired
}
