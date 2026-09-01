# Yiru APNs gateway

This Worker is the sole stateless exception to Yiru's no-cloud architecture. It validates one
bounded request, forwards an opaque encrypted notification to APNs, and stores no device or session
data. The daemon keeps notification details encrypted end to end; the iOS notification service
extension decrypts them locally.

Configure the four declared secrets with `wrangler secret put`: `APNS_KEY_ID`, `APNS_KEY_P8`,
`APNS_TEAM_ID`, and `GATEWAY_SHARED_SECRET`. Use a production APNs key for the default deployment.
For development devices, deploy a separate Worker environment with `APNS_ENVIRONMENT` set to
`sandbox`; never route production and sandbox device tokens through the same deployment.

The daemon deployment needs `YIRU_APNS_GATEWAY_URL` (ending in `/v1/push`) and the matching
`YIRU_APNS_GATEWAY_TOKEN`. The shared secret is operational infrastructure configuration and is
never embedded in the open-source daemon binary.
