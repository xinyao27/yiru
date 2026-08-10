import type { RuntimeRendererTarget } from './runtime/host/renderer-target'

export type MainIpcInvokeEvent = {
  sender: RuntimeRendererTarget
}

export type MainIpcRegistration = {
  handle: <TArgs extends unknown[], TResult>(
    channel: string,
    listener: (event: MainIpcInvokeEvent, ...args: TArgs) => TResult
  ) => void
  removeHandler: (channel: string) => void
}
