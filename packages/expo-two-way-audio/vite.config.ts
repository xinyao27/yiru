import { defineConfig } from 'vite-plus'

import yiruRootToolingConfig from '../../vite.config.ts'

export default defineConfig({
  fmt: yiruRootToolingConfig.fmt,
  lint: yiruRootToolingConfig.lint,
  test: {
    passWithNoTests: true
  },
  run: {
    tasks: {
      build: {
        // Why: this package is an Expo native module, so its framework compiler
        // owns the output contract instead of Vite+'s publishable-library packer.
        command: 'tsc',
        input: [{ auto: true }, '!build/**', '!dist/**', '!node_modules/**']
      }
    }
  }
})
