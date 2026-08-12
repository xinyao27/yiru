import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import {
  loadTerminalWireSource,
  renderTerminalWireContract
} from './mobile-ios-wire/terminal-wire.mjs'

const packageRequire = createRequire(new URL('../apps/mobile-ios/package.json', import.meta.url))
const {
  DeviceCredentialInstalledSchema,
  DeviceResumeConfirmedSchema,
  MobileRelayEndpointSchema,
  PairingGetEndpointsParamsSchema,
  PairingProvisionRelayParamsSchema
} = packageRequire('@yiru/mobile-relay-protocol/credential-contract')
const {
  MOBILE_E2EE_V2_KDF_DOMAIN,
  MOBILE_E2EE_V2_TRANSCRIPT_DOMAIN,
  MobileE2EEV2ContextSchema,
  MobileE2EEV2HelloSchema,
  MobileE2EEV2ReadySchema
} = packageRequire('@yiru/mobile-relay-protocol/e2ee-contract')
const { PairingOfferSchema } = packageRequire('@yiru/mobile-relay-protocol/pairing-offer')
const { RelayMovedSchema } = packageRequire('@yiru/mobile-relay-protocol/phone-protocol')
const {
  MOBILE_WORKTREE_PS_ORPC_PATH,
  MobileWorkspaceListRequestSchema,
  MobileWorkspaceListSchema
} = packageRequire('@yiru/runtime-protocol/mobile-worktree-wire')
const { RUNTIME_ORPC_REQUEST_ID_HEADER, RUNTIME_ORPC_TEXT_PREFIX } = packageRequire(
  '@yiru/runtime-protocol/orpc-peer-frame'
)
const { z } = packageRequire('zod')
const terminalWire = loadTerminalWireSource(packageRequire, z)

const OUTPUT_URL = new URL(
  '../apps/mobile-ios/YiruMobile/Platform/Wire/Generated/MobileWire.generated.swift',
  import.meta.url
)
const FORMAT_CONFIGURATION_URL = new URL('../apps/mobile-ios/.swift-format', import.meta.url)

const mode = process.argv[2]
if (mode !== '--write' && mode !== '--check') {
  throw new Error('Usage: node scripts/generate-mobile-ios-wire-contracts.mjs --write|--check')
}

const schemas = {
  PairingOfferSchema: z.toJSONSchema(PairingOfferSchema),
  PairingProvisionRelayParamsSchema: z.toJSONSchema(PairingProvisionRelayParamsSchema),
  PairingGetEndpointsParamsSchema: z.toJSONSchema(PairingGetEndpointsParamsSchema),
  DeviceCredentialInstalledSchema: z.toJSONSchema(DeviceCredentialInstalledSchema),
  DeviceResumeConfirmedSchema: z.toJSONSchema(DeviceResumeConfirmedSchema),
  MobileRelayEndpointSchema: z.toJSONSchema(MobileRelayEndpointSchema),
  RelayMovedSchema: z.toJSONSchema(RelayMovedSchema),
  MobileE2EEV2ContextSchema: z.toJSONSchema(MobileE2EEV2ContextSchema),
  MobileE2EEV2HelloSchema: z.toJSONSchema(MobileE2EEV2HelloSchema),
  MobileE2EEV2ReadySchema: z.toJSONSchema(MobileE2EEV2ReadySchema),
  MobileWorkspaceListSchema: z.toJSONSchema(MobileWorkspaceListSchema),
  MobileWorkspaceListRequestSchema: z.toJSONSchema(MobileWorkspaceListRequestSchema),
  ...terminalWire.schemas
}
const pairingContract = readPairingContract(schemas.PairingOfferSchema)
const e2eeContract = readE2EEContract(
  schemas.MobileE2EEV2ContextSchema,
  schemas.MobileE2EEV2HelloSchema,
  schemas.MobileE2EEV2ReadySchema,
  MOBILE_E2EE_V2_KDF_DOMAIN,
  MOBILE_E2EE_V2_TRANSCRIPT_DOMAIN
)
const runtimeContract = readRuntimeContract(
  schemas.MobileWorkspaceListSchema,
  schemas.MobileWorkspaceListRequestSchema
)
const terminalContract = terminalWire.contract
const contractSource = {
  schemas,
  domains: {
    MOBILE_E2EE_V2_KDF_DOMAIN,
    MOBILE_E2EE_V2_TRANSCRIPT_DOMAIN,
    MOBILE_WORKTREE_PS_ORPC_PATH,
    ...terminalWire.domains,
    RUNTIME_ORPC_REQUEST_ID_HEADER,
    RUNTIME_ORPC_TEXT_PREFIX
  }
}
const contractJSON = `${JSON.stringify(contractSource, null, 2)}\n`
const digest = createHash('sha256').update(contractJSON).digest('hex')
const generated = formatSwift(
  renderWireContract(
    pairingContract,
    e2eeContract,
    runtimeContract,
    terminalContract,
    schemas,
    digest
  )
)

if (mode === '--write') {
  await writeFile(OUTPUT_URL, generated)
  process.stdout.write(`Wrote ${fileURLToPath(OUTPUT_URL)}\n`)
} else {
  const existing = await readFile(OUTPUT_URL, 'utf8').catch(() => null)
  if (existing !== generated) {
    throw new Error('Swift pairing wire contract is stale. Run vp run generate:mobile-ios-wire.')
  }
  process.stdout.write(`Swift mobile wire contract is current (${digest.slice(0, 12)}).\n`)
}

function formatSwift(source) {
  return execFileSync(
    'xcrun',
    [
      'swift-format',
      'format',
      '--configuration',
      fileURLToPath(FORMAT_CONFIGURATION_URL),
      '--assume-filename',
      fileURLToPath(OUTPUT_URL),
      '-'
    ],
    { input: source, encoding: 'utf8' }
  )
}

function readPairingContract(value) {
  const root = requireObjectSchema(value, 'PairingOfferSchema')
  assertExactKeys(
    root.properties,
    ['v', 'endpoint', 'deviceToken', 'publicKeyB64', 'scope', 'relay'],
    'PairingOfferSchema.properties'
  )
  assertRequired(root, ['v', 'endpoint', 'deviceToken', 'publicKeyB64'], 'PairingOfferSchema')

  const relay = requireObjectSchema(root.properties.relay, 'PairingOfferSchema.relay')
  assertExactKeys(
    relay.properties,
    [
      'v',
      'directorUrl',
      'cellUrl',
      'assignmentEpoch',
      'relayHostId',
      'inviteToken',
      'inviteExpiresAt',
      'e2eeFraming'
    ],
    'PairingOfferSchema.relay.properties'
  )
  assertRequired(
    relay,
    [
      'v',
      'directorUrl',
      'cellUrl',
      'assignmentEpoch',
      'relayHostId',
      'inviteToken',
      'inviteExpiresAt',
      'e2eeFraming'
    ],
    'PairingOfferSchema.relay'
  )

  return {
    offerVersion: requireIntegerLiteral(root.properties.v, 'PairingOfferSchema.v'),
    scopes: requireStringEnum(root.properties.scope, 'PairingOfferSchema.scope'),
    relayVersion: requireIntegerLiteral(relay.properties.v, 'PairingOfferSchema.relay.v'),
    e2eeFraming: requireIntegerLiteral(
      relay.properties.e2eeFraming,
      'PairingOfferSchema.relay.e2eeFraming'
    ),
    relayHostIdPattern: requirePattern(
      relay.properties.relayHostId,
      'PairingOfferSchema.relay.relayHostId'
    ),
    inviteTokenPattern: requirePattern(
      relay.properties.inviteToken,
      'PairingOfferSchema.relay.inviteToken'
    )
  }
}

function readE2EEContract(contextValue, helloValue, readyValue, kdfDomain, transcriptDomain) {
  const contexts = requireUnionSchemas(contextValue, 'MobileE2EEV2ContextSchema')
  const direct = requireObjectSchema(contexts[0], 'MobileE2EEV2ContextSchema.direct')
  const relay = requireObjectSchema(contexts[1], 'MobileE2EEV2ContextSchema.relay')
  assertExactKeys(
    direct.properties,
    ['protocol', 'initiator', 'responder', 'transport'],
    'MobileE2EEV2ContextSchema.direct.properties'
  )
  assertExactKeys(
    relay.properties,
    ['protocol', 'initiator', 'responder', 'transport', 'relayHostId'],
    'MobileE2EEV2ContextSchema.relay.properties'
  )

  const hello = requireObjectSchema(helloValue, 'MobileE2EEV2HelloSchema')
  assertExactKeys(
    hello.properties,
    ['type', 'v', 'clientPublicKeyB64', 'clientNonceB64', 'capabilities', 'context'],
    'MobileE2EEV2HelloSchema.properties'
  )
  assertRequired(hello, Object.keys(hello.properties), 'MobileE2EEV2HelloSchema')
  const capabilities = requireObjectSchema(
    hello.properties.capabilities,
    'MobileE2EEV2HelloSchema.capabilities'
  )
  assertExactKeys(
    capabilities.properties,
    ['framing', 'payloadKinds'],
    'MobileE2EEV2HelloSchema.capabilities.properties'
  )
  assertRequired(
    capabilities,
    Object.keys(capabilities.properties),
    'MobileE2EEV2HelloSchema.capabilities'
  )

  const ready = requireObjectSchema(readyValue, 'MobileE2EEV2ReadySchema')
  assertExactKeys(
    ready.properties,
    [
      'type',
      'v',
      'desktopPublicKeyB64',
      'clientNonceB64',
      'desktopNonceB64',
      'selection',
      'context'
    ],
    'MobileE2EEV2ReadySchema.properties'
  )
  assertRequired(ready, Object.keys(ready.properties), 'MobileE2EEV2ReadySchema')
  const selection = requireObjectSchema(
    ready.properties.selection,
    'MobileE2EEV2ReadySchema.selection'
  )
  assertExactKeys(
    selection.properties,
    ['framing', 'payloadKinds'],
    'MobileE2EEV2ReadySchema.selection.properties'
  )
  assertRequired(selection, Object.keys(selection.properties), 'MobileE2EEV2ReadySchema.selection')

  const framing = requireNumberTuple(capabilities.properties.framing, 'capabilities.framing')
  const payloadKinds = requireStringTuple(
    capabilities.properties.payloadKinds,
    'capabilities.payloadKinds'
  )
  assertEqualTuple(
    payloadKinds,
    requireStringTuple(selection.properties.payloadKinds, 'selection.payloadKinds'),
    'E2EE payload kinds'
  )
  if (framing.length !== 1) {
    throw new Error('E2EE framing capabilities must contain exactly one version')
  }
  const selectedFraming = requireIntegerLiteral(selection.properties.framing, 'selection.framing')
  if (selectedFraming !== framing[0]) {
    throw new Error('E2EE selected framing must match the offered framing')
  }

  const base64Pattern = requireSharedPattern(
    [
      hello.properties.clientPublicKeyB64,
      hello.properties.clientNonceB64,
      ready.properties.desktopPublicKeyB64,
      ready.properties.clientNonceB64,
      ready.properties.desktopNonceB64
    ],
    'E2EE 32-byte base64 fields'
  )

  return {
    protocol: requireStringLiteral(direct.properties.protocol, 'context.protocol'),
    initiator: requireStringLiteral(direct.properties.initiator, 'context.initiator'),
    responder: requireStringLiteral(direct.properties.responder, 'context.responder'),
    directTransport: requireStringLiteral(direct.properties.transport, 'direct.transport'),
    relayTransport: requireStringLiteral(relay.properties.transport, 'relay.transport'),
    relayHostIdPattern: requirePattern(relay.properties.relayHostId, 'relay.relayHostId'),
    helloType: requireStringLiteral(hello.properties.type, 'hello.type'),
    readyType: requireStringLiteral(ready.properties.type, 'ready.type'),
    version: requireIntegerLiteral(hello.properties.v, 'hello.v'),
    readyVersion: requireIntegerLiteral(ready.properties.v, 'ready.v'),
    framing: framing[0],
    payloadKinds,
    base64Pattern,
    kdfDomain,
    transcriptDomain
  }
}

function readRuntimeContract(value, requestValue) {
  const root = requireObjectSchema(value, 'MobileWorkspaceListSchema')
  assertExactKeys(
    root.properties,
    ['worktrees', 'totalCount', 'truncated'],
    'MobileWorkspaceListSchema.properties'
  )
  assertRequired(root, Object.keys(root.properties), 'MobileWorkspaceListSchema')
  const worktrees = requireArraySchema(
    root.properties.worktrees,
    'MobileWorkspaceListSchema.worktrees'
  )
  const item = requireObjectSchema(worktrees.items, 'MobileWorkspaceListItemSchema')
  const expected = [
    'worktreeId',
    'repo',
    'path',
    'branch',
    'displayName',
    'workspaceStatus',
    'isArchived',
    'isMainWorktree',
    'isPinned',
    'isActive',
    'unread',
    'liveTerminalCount',
    'lastActivityAt',
    'lastOutputAt',
    'preview',
    'status'
  ]
  assertExactKeys(item.properties, expected, 'MobileWorkspaceListItemSchema.properties')
  assertRequired(
    item,
    expected.filter((key) => key !== 'isMainWorktree' && key !== 'lastActivityAt'),
    'MobileWorkspaceListItemSchema'
  )
  const request = requireObjectSchema(requestValue, 'MobileWorkspaceListRequestSchema')
  assertExactKeys(request.properties, ['limit'], 'MobileWorkspaceListRequestSchema.properties')
  assertRequired(request, [], 'MobileWorkspaceListRequestSchema')
  return {
    statuses: requireStringEnum(item.properties.status, 'MobileWorkspaceListItemSchema.status'),
    path: MOBILE_WORKTREE_PS_ORPC_PATH,
    requestIdHeader: RUNTIME_ORPC_REQUEST_ID_HEADER,
    textPrefix: RUNTIME_ORPC_TEXT_PREFIX
  }
}

function renderWireContract(pairing, e2ee, runtime, terminal, sourceSchemas, digest) {
  if (e2ee.readyVersion !== e2ee.version) {
    throw new Error('E2EE hello and ready versions must match')
  }
  const pairingSource = renderPairingContract(pairing, sourceSchemas)
  const e2eeSource = renderE2EEContract(e2ee)
  const runtimeSource = renderRuntimeContract(runtime)
  const terminalSource = renderTerminalWireContract(terminal)
  const source = `// Generated by scripts/generate-mobile-ios-wire-contracts.mjs. Do not edit.\n// Mobile wire schemas SHA-256: ${digest}\n\nimport Foundation\n\n${pairingSource}\n${e2eeSource}\n${runtimeSource}\n${terminalSource}`
  return source.replace(/^(enum|struct) /gm, 'nonisolated $1 ')
}

function renderRuntimeContract(contract) {
  const statusCases = contract.statuses
    .map((status) => `    case ${swiftCase(status)} = ${JSON.stringify(status)}`)
    .join('\n')
  return `enum MobileWorkspaceActivityWire: String, Codable, Equatable, Sendable {\n${statusCases}\n}\n\nstruct MobileWorkspaceListRequestWire: Codable, Equatable, Sendable {\n    let limit: Int?\n}\n\nstruct MobileWorkspaceListItemWire: Codable, Equatable, Sendable {\n    let worktreeId: String\n    let repo: String\n    let path: String\n    let branch: String\n    let displayName: String\n    let workspaceStatus: String\n    let isArchived: Bool\n    let isMainWorktree: Bool?\n    let isPinned: Bool\n    let isActive: Bool\n    let unread: Bool\n    let liveTerminalCount: Int\n    let lastActivityAt: Int64?\n    let lastOutputAt: Int64?\n    let preview: String\n    let status: MobileWorkspaceActivityWire\n}\n\nstruct MobileWorkspaceListWire: Codable, Equatable, Sendable {\n    let worktrees: [MobileWorkspaceListItemWire]\n    let totalCount: Int\n    let truncated: Bool\n}\n\nenum MobileRuntimeWireContract {\n    static let textPrefix = ${JSON.stringify(contract.textPrefix)}\n    static let requestIdHeader = ${JSON.stringify(contract.requestIdHeader)}\n    static let worktreeListPath = ${JSON.stringify(contract.path)}\n}\n`
}

function renderPairingContract(contract, sourceSchemas) {
  const scopeCases = contract.scopes.map((scope) => `    case ${scope}`).join('\n')
  const simpleModels = [
    renderSimpleObject(
      sourceSchemas.PairingProvisionRelayParamsSchema,
      'PairingProvisionRelayParamsWire'
    ),
    renderSimpleObject(
      sourceSchemas.PairingGetEndpointsParamsSchema,
      'PairingGetEndpointsParamsWire'
    ),
    renderSimpleObject(
      sourceSchemas.DeviceCredentialInstalledSchema,
      'DeviceCredentialInstalledWire'
    ),
    renderSimpleObject(sourceSchemas.DeviceResumeConfirmedSchema, 'DeviceResumeConfirmedWire'),
    renderSimpleObject(sourceSchemas.MobileRelayEndpointSchema, 'MobileRelayEndpointWire'),
    renderSimpleObject(sourceSchemas.RelayMovedSchema, 'RelayMovedWire')
  ].join('\n\n')
  return `enum PairingScopeWire: String, Codable, Equatable, Sendable {\n${scopeCases}\n}\n\nstruct PairingRelayWire: Codable, Equatable, Sendable {\n    let v: Int\n    let directorUrl: String\n    let cellUrl: String\n    let assignmentEpoch: Int64\n    let relayHostId: String\n    let inviteToken: String\n    let inviteExpiresAt: Int64\n    let e2eeFraming: Int\n}\n\nstruct PairingOfferWire: Codable, Equatable, Sendable {\n    let v: Int\n    let endpoint: String\n    let deviceToken: String\n    let publicKeyB64: String\n    let scope: PairingScopeWire?\n    let relay: PairingRelayWire?\n}\n\n${simpleModels}\n\nenum MobilePairingWireContract {\n    static let offerVersion = ${contract.offerVersion}\n    static let relayVersion = ${contract.relayVersion}\n    static let e2eeFraming = ${contract.e2eeFraming}\n    static let relayHostIdPattern = ${JSON.stringify(contract.relayHostIdPattern)}\n    static let inviteTokenPattern = ${JSON.stringify(contract.inviteTokenPattern)}\n}\n`
}

function renderE2EEContract(contract) {
  const payloadKindCases = contract.payloadKinds
    .map((kind) => `    case ${swiftCase(kind)} = ${JSON.stringify(kind)}`)
    .join('\n')
  return `enum MobileE2EEPayloadKindWire: String, Codable, Equatable, Sendable {\n${payloadKindCases}\n}\n\nstruct MobileE2EEContextWire: Codable, Equatable, Sendable {\n    let protocolName: String\n    let initiator: String\n    let responder: String\n    let transport: String\n    let relayHostId: String?\n\n    private enum CodingKeys: String, CodingKey {\n        case protocolName = "protocol"\n        case initiator\n        case responder\n        case transport\n        case relayHostId\n    }\n}\n\nstruct MobileE2EECapabilitiesWire: Codable, Equatable, Sendable {\n    let framing: [Int]\n    let payloadKinds: [MobileE2EEPayloadKindWire]\n}\n\nstruct MobileE2EEHelloWire: Codable, Equatable, Sendable {\n    let type: String\n    let v: Int\n    let clientPublicKeyB64: String\n    let clientNonceB64: String\n    let capabilities: MobileE2EECapabilitiesWire\n    let context: MobileE2EEContextWire\n}\n\nstruct MobileE2EESelectionWire: Codable, Equatable, Sendable {\n    let framing: Int\n    let payloadKinds: [MobileE2EEPayloadKindWire]\n}\n\nstruct MobileE2EEReadyWire: Codable, Equatable, Sendable {\n    let type: String\n    let v: Int\n    let desktopPublicKeyB64: String\n    let clientNonceB64: String\n    let desktopNonceB64: String\n    let selection: MobileE2EESelectionWire\n    let context: MobileE2EEContextWire\n}\n\nenum MobileE2EEWireContract {\n    static let protocolName = ${JSON.stringify(contract.protocol)}\n    static let initiator = ${JSON.stringify(contract.initiator)}\n    static let responder = ${JSON.stringify(contract.responder)}\n    static let directTransport = ${JSON.stringify(contract.directTransport)}\n    static let relayTransport = ${JSON.stringify(contract.relayTransport)}\n    static let helloType = ${JSON.stringify(contract.helloType)}\n    static let readyType = ${JSON.stringify(contract.readyType)}\n    static let version = ${contract.version}\n    static let framing = ${contract.framing}\n    static let relayHostIdPattern = ${JSON.stringify(contract.relayHostIdPattern)}\n    static let base64Bytes32Pattern = ${JSON.stringify(contract.base64Pattern)}\n    static let kdfDomain = ${JSON.stringify(contract.kdfDomain)}\n    static let transcriptDomain = ${JSON.stringify(contract.transcriptDomain)}\n}\n`
}

function renderSimpleObject(value, name) {
  const schemaValue = requireObjectSchema(value, name)
  const required = new Set(schemaValue.required ?? [])
  const enums = []
  const properties = Object.entries(schemaValue.properties).map(([propertyName, property]) => {
    const type = swiftType(property, `${name}${upperFirst(propertyName)}`, enums)
    const optional = required.has(propertyName) ? '' : '?'
    return `    let ${propertyName}: ${type}${optional}`
  })
  const enumSource = enums.join('\n\n')
  const structSource = `struct ${name}: Codable, Equatable, Sendable {\n${properties.join('\n')}\n}`
  return enumSource ? `${enumSource}\n\n${structSource}` : structSource
}

function swiftType(value, enumName, enums) {
  if (!isRecord(value)) {
    throw new Error(`${enumName} has an unsupported schema`)
  }
  if (value.type === 'string') {
    if (Array.isArray(value.enum)) {
      const cases = value.enum.map((entry) => {
        if (typeof entry !== 'string') {
          throw new Error(`${enumName} contains a non-string case`)
        }
        return `    case ${swiftCase(entry)} = ${JSON.stringify(entry)}`
      })
      enums.push(`enum ${enumName}: String, Codable, Equatable, Sendable {\n${cases.join('\n')}\n}`)
      return enumName
    }
    return 'String'
  }
  if (value.type === 'boolean') {
    return 'Bool'
  }
  if (value.type === 'integer') {
    return 'Int64'
  }
  if (value.type === 'number' && Number.isInteger(value.const)) {
    return 'Int'
  }
  throw new Error(`${enumName} has unsupported schema type ${String(value.type)}`)
}

function swiftCase(value) {
  const words = value.split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (words.length === 0) {
    throw new Error(`Cannot generate a Swift case for ${value}`)
  }
  const [first, ...rest] = words
  return `${first.toLowerCase()}${rest.map(upperFirst).join('')}`
}

function upperFirst(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function requireObjectSchema(value, label) {
  if (!isRecord(value) || value.type !== 'object' || !isRecord(value.properties)) {
    throw new Error(`${label} must remain an object schema`)
  }
  if (value.additionalProperties !== false) {
    throw new Error(`${label} must reject unknown properties`)
  }
  return value
}

function requireArraySchema(value, label) {
  if (!isRecord(value) || value.type !== 'array' || !isRecord(value.items)) {
    throw new Error(`${label} must remain an array schema`)
  }
  return value
}

function assertExactKeys(properties, expected, label) {
  const actual = Object.keys(properties)
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(
      `${label} changed: expected ${expected.join(', ')}, received ${actual.join(', ')}`
    )
  }
}

function assertRequired(schemaValue, expected, label) {
  const actual = schemaValue.required ?? []
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label}.required changed`)
  }
}

function requireIntegerLiteral(value, label) {
  if (!isRecord(value) || value.type !== 'number' || !Number.isInteger(value.const)) {
    throw new Error(`${label} must remain an integer literal`)
  }
  return value.const
}

function requireStringLiteral(value, label) {
  if (!isRecord(value) || value.type !== 'string' || typeof value.const !== 'string') {
    throw new Error(`${label} must remain a string literal`)
  }
  return value.const
}

function requireUnionSchemas(value, label) {
  if (!isRecord(value) || !Array.isArray(value.oneOf) || value.oneOf.length === 0) {
    throw new Error(`${label} must remain a non-empty oneOf schema`)
  }
  return value.oneOf
}

function requireNumberTuple(value, label) {
  if (!isRecord(value) || value.type !== 'array' || !Array.isArray(value.prefixItems)) {
    throw new Error(`${label} must remain a number tuple`)
  }
  return value.prefixItems.map((entry, index) => requireIntegerLiteral(entry, `${label}[${index}]`))
}

function requireStringTuple(value, label) {
  if (!isRecord(value) || value.type !== 'array' || !Array.isArray(value.prefixItems)) {
    throw new Error(`${label} must remain a string tuple`)
  }
  return value.prefixItems.map((entry, index) => requireStringLiteral(entry, `${label}[${index}]`))
}

function assertEqualTuple(left, right, label) {
  if (left.length !== right.length || left.some((entry, index) => entry !== right[index])) {
    throw new Error(`${label} changed between handshake messages`)
  }
}

function requireSharedPattern(values, label) {
  const patterns = values.map((value, index) => requirePattern(value, `${label}[${index}]`))
  if (patterns.some((pattern) => pattern !== patterns[0])) {
    throw new Error(`${label} must share one pattern`)
  }
  return patterns[0]
}

function requireStringEnum(value, label) {
  if (
    !isRecord(value) ||
    value.type !== 'string' ||
    !Array.isArray(value.enum) ||
    value.enum.length === 0 ||
    !value.enum.every((entry) => typeof entry === 'string')
  ) {
    throw new Error(`${label} must remain a non-empty string enum`)
  }
  return value.enum
}

function requirePattern(value, label) {
  if (!isRecord(value) || value.type !== 'string' || typeof value.pattern !== 'string') {
    throw new Error(`${label} must remain a patterned string`)
  }
  return value.pattern
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
