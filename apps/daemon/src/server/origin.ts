import { YIRU_EXTENSION_ORIGIN } from '../native-messaging/identity'

const CHROME_EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/

export function readAllowedExtensionOrigins(environment: NodeJS.ProcessEnv): ReadonlySet<string> {
  return new Set([
    YIRU_EXTENSION_ORIGIN,
    ...(environment.YIRU_EXTENSION_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => CHROME_EXTENSION_ORIGIN.test(origin))
  ])
}

export function isDaemonWebSocketOriginAllowed(
  origin: string | null,
  allowedExtensionOrigins: ReadonlySet<string>
): boolean {
  // Why: native CLI and mobile WebSocket stacks do not send a browser Origin header.
  return origin === null || allowedExtensionOrigins.has(origin)
}
