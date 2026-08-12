# Pairing invariants

- QR accepts only `yiru://pair?code=…` and `yiru://pair#…`; paste additionally accepts a bare
  base64url payload.
- Unknown JSON keys, invalid versions, malformed relay origins, expired invites, and relay/runtime
  scope mismatches fail closed before network access.
- A pairing attempt has a 25-second overall deadline and is cancelled when its screen disappears.
- A host is persisted only after WebSocket, E2EE v2, transcript binding, and device-token
  authentication all succeed.
- Device tokens live in a `ThisDeviceOnly` Keychain item. Host metadata never contains the token.
- Re-pairing the same desktop public key preserves its host identity and display name.
- Direct transport is the first native vertical slice. Relay provisioning remains unavailable until
  its director/cell state machine and credential rotation are ported together.
