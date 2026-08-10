import { RuntimeClientError } from './runtime-client'

export type EmulatorOrientation =
  | 'landscape_left'
  | 'landscape_right'
  | 'portrait'
  | 'portrait_upside_down'

export function parseEmulatorOrientation(value: string): EmulatorOrientation {
  if (
    value !== 'landscape_left' &&
    value !== 'landscape_right' &&
    value !== 'portrait' &&
    value !== 'portrait_upside_down'
  ) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--orientation must be landscape_left, landscape_right, portrait, or portrait_upside_down'
    )
  }
  return value
}
