// The ready handshake a deployed relay bundle performs with the host that
// launched it: the guest writes RELAY_SENTINEL to stdout once it is listening,
// the host consumes stdout up to that marker and then treats the remaining
// stdio as the multiplexer transport.
//
// Why this lives in shared/: guest and host must agree on the byte sequence and
// the wait budget, and they sit in different process trees — the guest side is
// bundled standalone (`src/relay/`), the host side runs in Electron main. A
// second copy of the literal would break the handshake on the next version bump
// without any import to catch it.

export const RELAY_VERSION = '0.1.0'

export const RELAY_SENTINEL = `YIRU-RELAY v${RELAY_VERSION} READY\n`

export const RELAY_SENTINEL_TIMEOUT_MS = 10_000
