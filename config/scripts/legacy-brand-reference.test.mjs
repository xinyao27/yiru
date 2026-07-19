import { execFileSync, spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

const scriptDir = import.meta.dirname
const projectDir = dirname(dirname(scriptDir))
const legacyBrand = ['or', 'ca'].join('')

function trackedPaths() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: projectDir, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
}

describe('legacy brand references', () => {
  it('does not remain in tracked file names', () => {
    expect(trackedPaths().filter((path) => path.toLowerCase().includes(legacyBrand))).toEqual([])
  })

  it('does not remain in tracked text content', () => {
    const result = spawnSync(
      'git',
      ['grep', '-Iil', '-E', `(^|[^[:alpha:]])${legacyBrand}([^[:alpha:]]|$)`, '--'],
      { cwd: projectDir, encoding: 'utf8' }
    )

    // Why: git grep uses status 1 for a successful search with no matches.
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
  })
})
