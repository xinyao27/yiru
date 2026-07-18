import { defineConfig } from 'vite-plus'
import yiruRootToolingConfig from '../vite.config'
import { mobileMaxLinesRatchets } from './config/mobile-max-lines-ratchets'

const vitestOxcConfig = { tsconfig: false } as never
const rootLintConfig = yiruRootToolingConfig.lint

export default defineConfig({
  fmt: yiruRootToolingConfig.fmt,
  lint: {
    ...rootLintConfig,
    // Why: generated terminal code is checked at its source and must not become
    // formatting or lint debt every time the embedded engine is rebuilt.
    ignorePatterns: [
      ...(rootLintConfig?.ignorePatterns ?? []),
      'src/terminal/terminal-webview-engine.generated.ts'
    ],
    rules: {
      ...rootLintConfig?.rules,
      'react/exhaustive-deps': 'off',
      'react/no-unescaped-entities': 'off',
      'typescript/array-type': 'off',
      'typescript/consistent-type-definitions': 'off',
      'typescript/consistent-type-imports': 'off',
      'prefer-template': 'off',
      'no-useless-return': 'off',
      'unicorn/prefer-at': 'off',
      'unicorn/prefer-ternary': 'off',
      'unicorn/prefer-node-protocol': 'off'
    },
    overrides: [
      ...(rootLintConfig?.overrides ?? []),
      {
        // Why: Expo derives navigation parameter keys from bracketed route filenames,
        // so existing camelCase route parameters remain stable across deep links.
        files: ['app/**/[[]*[]].tsx'],
        rules: { 'unicorn/filename-case': 'off' }
      },
      ...mobileMaxLinesRatchets
    ],
    // Why: Expo still requires TypeScript 6's compiler API, while Vite+'s
    // integrated type-aware engine follows TypeScript 7 semantics.
    options: { typeAware: false, typeCheck: false }
  },
  root: import.meta.dirname,
  // Why: the app tsconfig intentionally excludes tests; Vite 8's OXC transform
  // otherwise fails before Vitest can run the test modules.
  oxc: vitestOxcConfig,
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
