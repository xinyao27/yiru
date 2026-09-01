import type { TranslationVariables } from '@yiru/runtime-protocol/workbench/localization/message-renderer'
import type { SupportedUiLocale } from '@yiru/runtime-protocol/workbench/ui-locale'

const MAIN_MESSAGES: Record<SupportedUiLocale, Readonly<Record<string, string>>> = {
  en: {
    'browser.chrome.exitedBeforeReady':
      'Chrome exited before DevTools became ready (exit {{exitCode}})',
    'browser.chrome.exitedWithDiagnostic': 'Chrome exited before DevTools became ready: {{reason}}',
    'browser.chrome.notAvailable': 'Chrome executable is not available: {{path}}',
    'browser.chrome.notConfigured': 'Chrome executable is not configured for this runtime host',
    'browser.chrome.startFailed': 'Could not start Chrome: {{reason}}',
    'browser.chrome.startTimeout': 'Timed out waiting {{timeoutMs}}ms for Chrome DevTools',
    'runtimeHost.appDataRequired': 'APPDATA is required to resolve the Yiru runtime data path',
    'runtimeHost.terminalMultiplexDedicatedConnection':
      'Terminal multiplex requires its own connection',
    'worktree.includeCopy.manualMany': 'Copy them in manually if this workspace needs them.',
    'worktree.includeCopy.manualOne': 'Copy it in manually if this workspace needs it.',
    'worktree.includeCopy.morePaths': '{{value0}} and {{value1}} more',
    'worktree.includeCopy.notCopiedMany':
      '.worktreeinclude entries {{value0}} were not copied into the new workspace',
    'worktree.includeCopy.notCopiedOne':
      '.worktreeinclude entry {{value0}} was not copied into the new workspace',
    'worktree.includeCopy.overBudgetMany':
      '{{value0}}: copying them would exceed the {{value1}} / {{value2}} file limit that keeps workspace creation responsive.',
    'worktree.includeCopy.overBudgetOne':
      '{{value0}}: copying it would exceed the {{value1}} / {{value2}} file limit that keeps workspace creation responsive.',
    'worktree.includeCopy.partialMany':
      '{{value0}} may hold a partial copy from the interrupted attempt — check them before reusing this workspace.',
    'worktree.includeCopy.partialOne':
      '{{value0}} may hold a partial copy from the interrupted attempt — check it before reusing this workspace.',
    'worktree.includeCopy.sizingBudget':
      '{{value0}}: earlier entries used up the budget for measuring what to copy.'
  },
  zh: {
    'browser.chrome.exitedBeforeReady': 'Chrome 在 DevTools 就绪前退出（退出码 {{exitCode}}）',
    'browser.chrome.exitedWithDiagnostic': 'Chrome 在 DevTools 就绪前退出：{{reason}}',
    'browser.chrome.notAvailable': 'Chrome 可执行文件不可用：{{path}}',
    'browser.chrome.notConfigured': '此 runtime host 未配置 Chrome 可执行文件',
    'browser.chrome.startFailed': '无法启动 Chrome：{{reason}}',
    'browser.chrome.startTimeout': '等待 Chrome DevTools 就绪超时（{{timeoutMs}} 毫秒）',
    'runtimeHost.appDataRequired': '需要 APPDATA 才能解析 Yiru runtime 数据路径',
    'runtimeHost.terminalMultiplexDedicatedConnection':
      'Terminal multiplex requires its own connection',
    'worktree.includeCopy.manualMany': 'Copy them in manually if this workspace needs them.',
    'worktree.includeCopy.manualOne': 'Copy it in manually if this workspace needs it.',
    'worktree.includeCopy.morePaths': '{{value0}} and {{value1}} more',
    'worktree.includeCopy.notCopiedMany':
      '.worktreeinclude entries {{value0}} were not copied into the new workspace',
    'worktree.includeCopy.notCopiedOne':
      '.worktreeinclude entry {{value0}} was not copied into the new workspace',
    'worktree.includeCopy.overBudgetMany':
      '{{value0}}: copying them would exceed the {{value1}} / {{value2}} file limit that keeps workspace creation responsive.',
    'worktree.includeCopy.overBudgetOne':
      '{{value0}}: copying it would exceed the {{value1}} / {{value2}} file limit that keeps workspace creation responsive.',
    'worktree.includeCopy.partialMany':
      '{{value0}} may hold a partial copy from the interrupted attempt — check them before reusing this workspace.',
    'worktree.includeCopy.partialOne':
      '{{value0}} may hold a partial copy from the interrupted attempt — check it before reusing this workspace.',
    'worktree.includeCopy.sizingBudget':
      '{{value0}}: earlier entries used up the budget for measuring what to copy.'
  }
}

export function renderMainMessage(
  locale: SupportedUiLocale,
  key: string,
  fallback: string,
  variables?: TranslationVariables
): string {
  const template = MAIN_MESSAGES[locale][key] ?? fallback
  if (!variables) {
    return template
  }
  return template.replace(/\{\{([^{}]+)\}\}/g, (placeholder: string, name: string) => {
    const value = variables[name.trim()]
    return value === undefined || value === null ? placeholder : String(value)
  })
}
