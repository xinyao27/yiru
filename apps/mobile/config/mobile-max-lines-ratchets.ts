type MaxLinesRule = ['error', { max: number; skipBlankLines: true; skipComments: true }]

function createMaxLinesRule(max: number): MaxLinesRule {
  return ['error', { max, skipBlankLines: true, skipComments: true }]
}

// Why: these limits record existing mobile module debt and may only move downward
// until each oversized screen can be split without destabilizing active work.
export const mobileMaxLinesRatchets = [
  {
    files: ['app/h/*/session/*.tsx'],
    rules: { 'max-lines': createMaxLinesRule(3_377) }
  },
  {
    files: ['src/terminal/web-view.tsx'],
    rules: { 'max-lines': createMaxLinesRule(373) }
  },
  {
    files: ['src/terminal/webview/html.ts'],
    rules: { 'max-lines': createMaxLinesRule(1_764) }
  },
  {
    files: ['app/h/*/index.tsx'],
    rules: { 'max-lines': createMaxLinesRule(959) }
  },
  {
    files: ['src/browser/pane.tsx'],
    rules: { 'max-lines': createMaxLinesRule(1_594) }
  },
  {
    files: ['app/index.tsx'],
    rules: { 'max-lines': createMaxLinesRule(851) }
  },
  {
    files: ['src/workspace-create/modal.tsx'],
    rules: { 'max-lines': createMaxLinesRule(1_039) }
  },
  {
    files: ['src/transport/rpc-client.ts'],
    rules: { 'max-lines': createMaxLinesRule(1_058) }
  },
  {
    files: ['src/components/rich-markdown-editor-html.ts'],
    rules: { 'max-lines': createMaxLinesRule(648) }
  },
  {
    files: ['src/terminal/accessory-keys.ts'],
    rules: { 'max-lines': createMaxLinesRule(378) }
  }
]
