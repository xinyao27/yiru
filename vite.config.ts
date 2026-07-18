import { resolve } from 'node:path'
import { defineConfig } from 'vite-plus'

const windowsTestWorkerOptions = process.platform === 'win32' ? { maxWorkers: 4 } : {}
const lintProfile = process.env.YIRU_LINT_PROFILE

const yiruRootToolingConfig = defineConfig({
  staged: {
    '*.{ts,tsx,js,jsx,mjs,mts,cts}': [
      'vp lint',
      'node config/scripts/run-vite-plus-lint-profile.mjs react-doctor',
      'vp fmt --write'
    ],
    '*.{json,css}': ['vp fmt --write']
  },
  fmt: {
    // Why: Markdown includes generated skill guides and content-sensitive test
    // fixtures; toolchain migration must not rewrite those payloads as source code.
    ignorePatterns: ['**/*.md'],
    singleQuote: true,
    semi: false,
    printWidth: 100,
    trailingComma: 'none'
  },
  lint:
    lintProfile === 'switch-exhaustiveness'
      ? {
          plugins: ['typescript'],
          categories: {
            correctness: 'off',
            suspicious: 'off',
            pedantic: 'off',
            perf: 'off',
            style: 'off',
            restriction: 'off',
            nursery: 'off'
          },
          rules: {
            'typescript/switch-exhaustiveness-check': [
              'error',
              { allowDefaultCaseForExhaustiveSwitch: false }
            ]
          },
          ignorePatterns: ['**/node_modules', '**/dist', '**/out', 'mobile/**'],
          options: { typeAware: true, typeCheck: false }
        }
      : lintProfile === 'react-doctor'
        ? {
            plugins: [],
            categories: {
              correctness: 'off',
              suspicious: 'off',
              pedantic: 'off',
              perf: 'off',
              style: 'off',
              restriction: 'off',
              nursery: 'off'
            },
            rules: {
              'react-doctor/no-adjust-state-on-prop-change': 'warn',
              'react-doctor/no-derived-state-effect': 'warn',
              'react-doctor/no-initialize-state': 'warn'
            },
            ignorePatterns: ['**/node_modules', '**/dist', '**/out', 'mobile/**'],
            options: { typeAware: false, typeCheck: false },
            jsPlugins: [{ name: 'react-doctor', specifier: 'oxlint-plugin-react-doctor' }]
          }
        : {
            plugins: ['typescript', 'react', 'react-perf', 'unicorn'],
            categories: {
              correctness: 'error'
            },
            rules: {
              'react/jsx-no-duplicate-props': 'error',
              'react/jsx-no-undef': 'error',
              'react/no-children-prop': 'error',
              'react/no-danger-with-children': 'error',
              'react/no-direct-mutation-state': 'error',
              'react/no-find-dom-node': 'error',
              'react/no-render-return-value': 'error',
              'react/no-string-refs': 'error',
              'react/no-unescaped-entities': 'error',
              'react/require-render-return': 'error',
              'react/rules-of-hooks': 'error',
              'react/exhaustive-deps': 'warn',
              'react/jsx-curly-brace-presence': [
                'error',
                {
                  props: 'never',
                  children: 'never',
                  propElementValues: 'always'
                }
              ],
              'react/jsx-filename-extension': [
                'error',
                {
                  extensions: ['.tsx', '.jsx']
                }
              ],
              'react/jsx-fragments': 'error',
              'react/jsx-key': 'error',
              'react/jsx-no-constructed-context-values': 'error',
              'react/jsx-no-target-blank': 'error',
              'react/jsx-no-useless-fragment': [
                'error',
                {
                  allowExpressions: true
                }
              ],
              'react/jsx-pascal-case': 'error',
              'react/no-object-type-as-default-prop': 'error',
              'react/self-closing-comp': 'error',
              'typescript/array-type': 'error',
              'typescript/consistent-indexed-object-style': 'error',
              'typescript/consistent-type-assertions': 'error',
              'typescript/consistent-type-definitions': ['error', 'type'],
              'typescript/consistent-type-imports': 'error',
              'typescript/no-explicit-any': [
                'error',
                {
                  ignoreRestArgs: true
                }
              ],
              'typescript/no-import-type-side-effects': 'error',
              'typescript/no-unnecessary-boolean-literal-compare': 'error',
              'typescript/no-unnecessary-template-expression': 'error',
              'typescript/no-unsafe-function-type': 'warn',
              'typescript/prefer-function-type': 'error',
              'typescript/prefer-includes': 'error',
              'typescript/prefer-optional-chain': 'error',
              'typescript/switch-exhaustiveness-check': [
                'error',
                {
                  allowDefaultCaseForExhaustiveSwitch: false
                }
              ],
              curly: 'error',
              'no-unneeded-ternary': 'error',
              'no-useless-return': 'error',
              'prefer-template': 'error',
              'unicorn/consistent-empty-array-spread': 'error',
              'unicorn/error-message': 'error',
              'unicorn/filename-case': 'error',
              'unicorn/no-array-fill-with-reference-type': 'warn',
              'unicorn/no-array-reverse': 'error',
              'unicorn/no-instanceof-builtins': 'error',
              'unicorn/no-useless-promise-resolve-reject': 'error',
              'unicorn/prefer-array-find': 'error',
              'unicorn/prefer-array-flat-map': 'warn',
              'unicorn/prefer-array-index-of': 'error',
              'unicorn/prefer-at': 'error',
              'unicorn/prefer-date-now': 'error',
              'unicorn/prefer-includes': 'error',
              'unicorn/prefer-import-meta-properties': 'error',
              'unicorn/prefer-math-min-max': 'error',
              'unicorn/prefer-negative-index': 'error',
              'unicorn/prefer-node-protocol': 'error',
              'unicorn/prefer-number-properties': 'error',
              'unicorn/prefer-object-from-entries': 'error',
              'unicorn/prefer-regexp-test': 'warn',
              'unicorn/prefer-ternary': 'error',
              'unicorn/throw-new-error': 'error',
              'vite-plus/prefer-vite-plus-imports': 'error'
            },
            overrides: [
              {
                files: ['**/*.ts'],
                rules: {
                  'max-lines': [
                    'error',
                    {
                      max: 300,
                      skipBlankLines: true,
                      skipComments: true
                    }
                  ]
                }
              },
              {
                files: ['**/*.tsx'],
                rules: {
                  'max-lines': [
                    'error',
                    {
                      max: 400,
                      skipBlankLines: true,
                      skipComments: true
                    }
                  ]
                }
              },
              {
                files: ['**/*.mjs'],
                rules: {
                  'max-lines': [
                    'error',
                    {
                      max: 600,
                      skipBlankLines: true,
                      skipComments: true
                    }
                  ]
                }
              },
              {
                files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
                rules: {
                  'max-lines': [
                    'error',
                    {
                      max: 800,
                      skipBlankLines: true,
                      skipComments: true
                    }
                  ]
                }
              }
            ],
            // Why: mobile is an independent pnpm/Vite+ workspace with React Native
            // exceptions and its own type-checking contract.
            ignorePatterns: ['**/node_modules', '**/dist', '**/out', 'mobile/**'],
            options: {
              // Why: Yiru type-checks three explicit tsc projects and enables only the
              // switch exhaustiveness type-aware rule in a separate narrow lint pass.
              typeAware: false,
              typeCheck: false
            },
            jsPlugins: [
              {
                name: 'vite-plus',
                specifier: 'vite-plus/oxlint-plugin'
              }
            ]
          },
  define: {
    YIRU_FEATURE_WALL_ENABLED: 'true'
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'config/scripts/**/*.test.mjs',
      'tests/e2e/**/*.unit.test.ts'
    ],
    // Why: the full suite runs heavy TS transforms plus real git/http fixtures;
    // the Vitest 5s defaults are too tight for the slowest integration cases.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    // Why: Windows process and shell startup are slower under full-suite load;
    // macOS/Linux keep Vitest's default worker parallelism.
    ...windowsTestWorkerOptions
  }
})

export default yiruRootToolingConfig
