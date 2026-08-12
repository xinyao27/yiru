import type { ShellStarNagApi } from '../../runtime/shell-system-client'

const noopUnsubscribe = (): void => {}

export const webShellStarNagApi: ShellStarNagApi = {
  onShow: () => noopUnsubscribe,
  onHide: () => noopUnsubscribe,
  dismiss: () => Promise.resolve(),
  later: () => Promise.resolve(),
  complete: () => Promise.resolve(),
  disable: () => Promise.resolve(),
  openWeb: () => Promise.resolve(),
  starYiru: () => Promise.resolve(false),
  forceShow: () => Promise.resolve(),
  agentValueMoment: () => Promise.resolve({ status: 'skipped' }),
  showAgentValueMoment: () => Promise.resolve(),
  onboardingCompleted: () => Promise.resolve()
}
