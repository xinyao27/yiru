type MaxLinesRule = ['error', { max: number; skipBlankLines: true; skipComments: true }]

function createMaxLinesRule(max: number): MaxLinesRule {
  return ['error', { max, skipBlankLines: true, skipComments: true }]
}

// Why: these limits record existing mobile module debt and may only move downward
// until each oversized screen can be split without destabilizing active work.
export const mobileMaxLinesRatchets = [
  {
    files: ['app/h/*/tasks.tsx'],
    rules: { 'max-lines': createMaxLinesRule(14_682) }
  },
  {
    files: ['app/h/*/session/*.tsx'],
    rules: { 'max-lines': createMaxLinesRule(5_015) }
  },
  {
    files: ['src/terminal/terminal-web-view.tsx'],
    rules: { 'max-lines': createMaxLinesRule(379) }
  },
  {
    files: ['src/terminal/terminal-webview-html.ts'],
    rules: { 'max-lines': createMaxLinesRule(1_784) }
  },
  {
    files: ['app/h/*/source-control/*.tsx'],
    rules: { 'max-lines': createMaxLinesRule(2_152) }
  },
  {
    files: ['app/h/*/index.tsx'],
    rules: { 'max-lines': createMaxLinesRule(1_603) }
  },
  {
    files: ['src/browser/mobile-browser-pane.tsx'],
    rules: { 'max-lines': createMaxLinesRule(1_594) }
  },
  {
    files: ['app/index.tsx'],
    rules: { 'max-lines': createMaxLinesRule(1_422) }
  },
  {
    files: ['src/components/new-worktree-modal.tsx'],
    rules: { 'max-lines': createMaxLinesRule(1_263) }
  },
  {
    files: ['src/transport/rpc-client.ts'],
    rules: { 'max-lines': createMaxLinesRule(1_074) }
  },
  {
    files: ['src/components/mobile-rich-markdown-editor-html.ts'],
    rules: { 'max-lines': createMaxLinesRule(648) }
  },
  {
    files: ['src/components/custom-key-modal.tsx'],
    rules: { 'max-lines': createMaxLinesRule(645) }
  },
  {
    files: ['app/pair-scan.tsx'],
    rules: { 'max-lines': createMaxLinesRule(531) }
  },
  {
    files: ['app/terminal-settings.tsx'],
    rules: { 'max-lines': createMaxLinesRule(514) }
  },
  {
    files: ['scripts/mock-server.ts'],
    rules: { 'max-lines': createMaxLinesRule(407) }
  },
  {
    files: ['src/terminal/terminal-accessory-keys.ts'],
    rules: { 'max-lines': createMaxLinesRule(388) }
  },
  {
    files: ['app/troubleshoot.tsx'],
    rules: { 'max-lines': createMaxLinesRule(436) }
  },
  {
    files: ['scripts/repro-worktree-startup-stream.ts'],
    rules: { 'max-lines': createMaxLinesRule(326) }
  },
  {
    files: ['scripts/repro-terminal-colors.ts'],
    rules: { 'max-lines': createMaxLinesRule(319) }
  },
  {
    files: ['app/h/*/files/*.tsx'],
    rules: { 'max-lines': createMaxLinesRule(402) }
  }
]
