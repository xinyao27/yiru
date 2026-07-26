import { getWorktreeExecutionHostId } from '@yiru/workbench-model/workspace'
import { describe, expect, it } from 'vite-plus/test'

describe('getWorktreeExecutionHostId', () => {
  it('prefers workspace ownership over the repo fallback', () => {
    expect(
      getWorktreeExecutionHostId({ hostId: 'runtime:wsl-ubuntu' }, { connectionId: 'ssh-project' })
    ).toBe('runtime:wsl-ubuntu')
  })

  it('falls back through SSH repo ownership and then the selected local host', () => {
    expect(getWorktreeExecutionHostId({}, { connectionId: 'ssh-project' })).toBe('ssh:ssh-project')
    expect(getWorktreeExecutionHostId({}, undefined, 'runtime:wsl-ubuntu')).toBe(
      'runtime:wsl-ubuntu'
    )
  })
})
