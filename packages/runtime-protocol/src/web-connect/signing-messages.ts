import type { BrowserIdentity, MachineSigningKey } from './contracts'

export function browserStatusSigningMessage(args: {
  grantId: string
  timestamp: number
  nonce: string
}): string {
  return ['yiru-connect-browser-status-v1', args.grantId, String(args.timestamp), args.nonce].join(
    '\n'
  )
}

export function browserCancelGrantSigningMessage(args: {
  grantId: string
  timestamp: number
  nonce: string
}): string {
  return ['yiru-connect-browser-cancel-v1', args.grantId, String(args.timestamp), args.nonce].join(
    '\n'
  )
}

export function machineConfirmationSigningMessage(args: {
  grantId: string
  machineId: string
  challenge: string
  verificationCode: string
}): string {
  return [
    'yiru-connect-machine-confirm-v1',
    args.grantId,
    args.machineId,
    args.challenge,
    args.verificationCode
  ].join('\n')
}

export function pairingVerificationMessage(args: {
  grantId: string
  browser: BrowserIdentity
  machineSigningKey: MachineSigningKey
}): string {
  return [
    'yiru-connect-pairing-verification-v1',
    args.grantId,
    args.browser.signingKey.x,
    args.browser.signingKey.y,
    args.machineSigningKey.x
  ].join('\n')
}

export function browserTicketSigningMessage(args: {
  machineId: string
  timestamp: number
  nonce: string
}): string {
  return [
    'yiru-connect-browser-ticket-v1',
    args.machineId,
    String(args.timestamp),
    args.nonce
  ].join('\n')
}

export function machineRelayAuthSigningMessage(args: {
  machineId: string
  timestamp: number
  nonce: string
  runtimePublicKeyB64: string
}): string {
  return [
    'yiru-connect-machine-relay-v1',
    args.machineId,
    String(args.timestamp),
    args.nonce,
    args.runtimePublicKeyB64
  ].join('\n')
}

export function browserRelayAuthSigningMessage(args: {
  machineId: string
  ticket: string
  timestamp: number
  nonce: string
  e2eePublicKeyB64: string
}): string {
  return [
    'yiru-connect-browser-relay-v1',
    args.machineId,
    args.ticket,
    String(args.timestamp),
    args.nonce,
    args.e2eePublicKeyB64
  ].join('\n')
}

export function machineBrowserReadySigningMessage(args: {
  machineId: string
  browserE2eePublicKeyB64: string
  runtimePublicKeyB64: string
  machineE2eePublicKeyB64: string
  encryptedDeviceTokenB64: string
}): string {
  return [
    'yiru-connect-machine-browser-ready-v1',
    args.machineId,
    args.browserE2eePublicKeyB64,
    args.runtimePublicKeyB64,
    args.machineE2eePublicKeyB64,
    args.encryptedDeviceTokenB64
  ].join('\n')
}

export function revokeBrowserAccessSigningMessage(args: {
  machineId: string
  browserId: string
  timestamp: number
  nonce: string
}): string {
  return [
    'yiru-connect-machine-revoke-browser-v1',
    args.machineId,
    args.browserId,
    String(args.timestamp),
    args.nonce
  ].join('\n')
}

export function browserSelfRevokeSigningMessage(args: {
  machineId: string
  browserId: string
  timestamp: number
  nonce: string
}): string {
  return [
    'yiru-connect-browser-self-revoke-v1',
    args.machineId,
    args.browserId,
    String(args.timestamp),
    args.nonce
  ].join('\n')
}
