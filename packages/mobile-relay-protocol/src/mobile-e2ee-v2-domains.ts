// Why: handshake schemas and transcript encoding must derive from the same
// protocol root without creating a runtime import cycle between those modules.
export const MOBILE_E2EE_V2_PROTOCOL = 'yiru-mobile-e2ee'
export const MOBILE_E2EE_V2_KDF_DOMAIN = `${MOBILE_E2EE_V2_PROTOCOL}/v2`
export const MOBILE_E2EE_V2_TRANSCRIPT_DOMAIN = `${MOBILE_E2EE_V2_KDF_DOMAIN}/transcript`
