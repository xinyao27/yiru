import { renderTerminalBulkInvocation } from './terminal-bulk-invocation-render.mjs'
import {
  readTerminalDisplayModeContract,
  renderTerminalDisplayModeWire
} from './terminal-display-mode-render.mjs'
import { readTerminalDriverContract } from './terminal-driver-contract.mjs'
import { renderTerminalStreamRecords } from './terminal-stream-render.mjs'

export function loadTerminalWireSource(packageRequire, z) {
  const terminal = packageRequire('@yiru/runtime-protocol/mobile-terminal-wire')
  const terminalContract = packageRequire('@yiru/runtime-protocol/contract')
  const frame = packageRequire('@yiru/runtime-protocol/terminal-multiplex/frame')
  const connectionRecords = packageRequire(
    '@yiru/runtime-protocol/terminal-multiplex/connection-records'
  )
  const flowRecords = packageRequire('@yiru/runtime-protocol/terminal-multiplex/flow-records')
  const snapshotRecords = packageRequire(
    '@yiru/runtime-protocol/terminal-multiplex/snapshot-records'
  )
  const streamRecords = packageRequire('@yiru/runtime-protocol/terminal-multiplex/stream-records')
  const crc32c = packageRequire('@yiru/runtime-protocol/terminal-multiplex/crc32c')
  const orpc = packageRequire('@yiru/runtime-protocol/orpc-peer-frame')
  const protocol = packageRequire('@yiru/runtime-protocol/capabilities')
  const schemas = {
    MobileRuntimeStatusSchema: z.toJSONSchema(terminal.MobileRuntimeStatusSchema),
    MobileTerminalSummarySchema: z.toJSONSchema(terminal.MobileTerminalSummarySchema),
    MobileTerminalListSchema: z.toJSONSchema(terminal.MobileTerminalListSchema),
    MobileTerminalListRequestSchema: z.toJSONSchema(terminal.MobileTerminalListRequestSchema),
    MobileTerminalHandleRequestSchema: z.toJSONSchema(terminal.MobileTerminalHandleRequestSchema),
    MobileTerminalShowSchema: z.toJSONSchema(terminal.MobileTerminalShowSchema),
    MobileTerminalOpenMultiplexRequestSchema: z.toJSONSchema(
      terminal.MobileTerminalOpenMultiplexRequestSchema
    ),
    MobileTerminalOpenMultiplexSchema: z.toJSONSchema(terminal.MobileTerminalOpenMultiplexSchema),
    MobileTerminalMultiplexInvocationSchema: z.toJSONSchema(
      terminal.MobileTerminalMultiplexInvocationSchema
    ),
    MobileTerminalMultiplexPeerMessageSchema: z.toJSONSchema(
      terminal.MobileTerminalMultiplexPeerMessageSchema
    ),
    TerminalSetDisplayModeInputSchema: z.toJSONSchema(
      terminalContract.TerminalSetDisplayModeInputSchema
    ),
    TerminalSetDisplayModeResultSchema: z.toJSONSchema(
      terminalContract.TerminalSetDisplayModeResultSchema
    ),
    TerminalMultiplexViewportRecordSchema: z.toJSONSchema(
      streamRecords.TerminalMultiplexViewportRecordSchema
    ),
    TerminalMultiplexClientRecordSchema: z.toJSONSchema(
      streamRecords.TerminalMultiplexClientRecordSchema
    ),
    TerminalMultiplexDeliveryRecordSchema: z.toJSONSchema(
      streamRecords.TerminalMultiplexDeliveryRecordSchema
    ),
    TerminalMultiplexCapabilitiesRecordSchema: z.toJSONSchema(
      streamRecords.TerminalMultiplexCapabilitiesRecordSchema
    ),
    TerminalMultiplexSubscribeRecordSchema: z.toJSONSchema(
      streamRecords.TerminalMultiplexSubscribeRecordSchema
    ),
    TerminalMultiplexSubscribedRecordSchema: z.toJSONSchema(
      streamRecords.TerminalMultiplexSubscribedRecordSchema
    ),
    TerminalMultiplexResizeRecordSchema: z.toJSONSchema(
      streamRecords.TerminalMultiplexResizeRecordSchema
    ),
    TerminalMultiplexErrorRecordSchema: z.toJSONSchema(
      streamRecords.TerminalMultiplexErrorRecordSchema
    ),
    TerminalMultiplexRevealRecordSchema: z.toJSONSchema(
      streamRecords.TerminalMultiplexRevealRecordSchema
    ),
    TerminalMultiplexSnapshotRequestRecordSchema: z.toJSONSchema(
      streamRecords.TerminalMultiplexSnapshotRequestRecordSchema
    ),
    TerminalMultiplexEndRecordSchema: z.toJSONSchema(
      streamRecords.TerminalMultiplexEndRecordSchema
    ),
    TerminalMultiplexModelRestoreRecordSchema: z.toJSONSchema(
      streamRecords.TerminalMultiplexModelRestoreRecordSchema
    )
  }
  const domains = {
    MOBILE_STATUS_GET_ORPC_PATH: terminal.MOBILE_STATUS_GET_ORPC_PATH,
    MOBILE_TERMINAL_LIST_ORPC_PATH: terminal.MOBILE_TERMINAL_LIST_ORPC_PATH,
    MOBILE_TERMINAL_SHOW_ORPC_PATH: terminal.MOBILE_TERMINAL_SHOW_ORPC_PATH,
    MOBILE_TERMINAL_SET_DISPLAY_MODE_ORPC_PATH: terminal.MOBILE_TERMINAL_SET_DISPLAY_MODE_ORPC_PATH,
    MOBILE_TERMINAL_OPEN_MULTIPLEX_ORPC_PATH: terminal.MOBILE_TERMINAL_OPEN_MULTIPLEX_ORPC_PATH,
    MOBILE_TERMINAL_MULTIPLEX_ORPC_PATH: terminal.MOBILE_TERMINAL_MULTIPLEX_ORPC_PATH,
    TERMINAL_MULTIPLEX_RUNTIME_CAPABILITY: protocol.TERMINAL_MULTIPLEX_RUNTIME_CAPABILITY,
    TERMINAL_MULTIPLEX_KIND: frame.TERMINAL_MULTIPLEX_KIND,
    TERMINAL_MULTIPLEX_VERSION: frame.TERMINAL_MULTIPLEX_VERSION,
    TERMINAL_MULTIPLEX_HEADER_BYTES: frame.TERMINAL_MULTIPLEX_HEADER_BYTES,
    TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES: frame.TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES,
    TERMINAL_MULTIPLEX_HARD_MAX_FRAME_BYTES: frame.TERMINAL_MULTIPLEX_HARD_MAX_FRAME_BYTES,
    TerminalMultiplexOpcode: frame.TerminalMultiplexOpcode,
    TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE:
      connectionRecords.TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE,
    TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE: flowRecords.TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE,
    TERMINAL_MULTIPLEX_SNAPSHOT_RECORD_WIRE:
      snapshotRecords.TERMINAL_MULTIPLEX_SNAPSHOT_RECORD_WIRE,
    TERMINAL_MULTIPLEX_STREAM_RECORD_WIRE: streamRecords.TERMINAL_MULTIPLEX_STREAM_RECORD_WIRE,
    TERMINAL_MULTIPLEX_CRC32C_POLYNOMIAL: crc32c.TERMINAL_MULTIPLEX_CRC32C_POLYNOMIAL,
    RUNTIME_ORPC_SIDE_CHANNEL_BINARY_KIND: orpc.RUNTIME_ORPC_SIDE_CHANNEL_BINARY_KIND,
    RUNTIME_ORPC_SIDE_CHANNEL_BINARY_VERSION: orpc.RUNTIME_ORPC_SIDE_CHANNEL_BINARY_VERSION,
    RUNTIME_ORPC_SIDE_CHANNEL_HEADER_BYTES: orpc.RUNTIME_ORPC_SIDE_CHANNEL_HEADER_BYTES
  }
  return {
    schemas,
    domains,
    contract: readTerminalWireContract(schemas, domains)
  }
}

function readTerminalWireContract(schemas, domains) {
  const status = requireObject(schemas.MobileRuntimeStatusSchema, 'MobileRuntimeStatusSchema')
  assertShape(status, ['runtimeId', 'capabilities'], ['runtimeId'])

  const summary = requireObject(schemas.MobileTerminalSummarySchema, 'MobileTerminalSummarySchema')
  const summaryKeys = [
    'handle',
    'ptyId',
    'worktreeId',
    'worktreeInstanceId',
    'worktreePath',
    'branch',
    'tabId',
    'leafId',
    'title',
    'connected',
    'writable',
    'lastOutputAt',
    'preview'
  ]
  assertShape(
    summary,
    summaryKeys,
    summaryKeys.filter((key) => key !== 'worktreeInstanceId')
  )

  const list = requireObject(schemas.MobileTerminalListSchema, 'MobileTerminalListSchema')
  assertShape(list, ['terminals', 'totalCount', 'truncated'])
  const listRequest = requireObject(
    schemas.MobileTerminalListRequestSchema,
    'MobileTerminalListRequestSchema'
  )
  assertShape(listRequest, ['worktree', 'limit', 'requireFreshPtyLiveness'], [])
  const show = requireObject(schemas.MobileTerminalShowSchema, 'MobileTerminalShowSchema')
  const showKeys = [...summaryKeys, 'paneRuntimeId', 'rendererGraphEpoch', 'transportGeneration']
  assertShape(
    show,
    showKeys,
    showKeys.filter((key) => key !== 'worktreeInstanceId')
  )
  const handle = requireObject(
    schemas.MobileTerminalHandleRequestSchema,
    'MobileTerminalHandleRequestSchema'
  )
  assertShape(handle, ['terminal'])
  const displayMode = readTerminalDisplayModeContract(schemas)
  const openRequest = requireObject(
    schemas.MobileTerminalOpenMultiplexRequestSchema,
    'MobileTerminalOpenMultiplexRequestSchema'
  )
  assertShape(openRequest, ['environmentId', 'clientInstanceId'])
  const open = requireObject(
    schemas.MobileTerminalOpenMultiplexSchema,
    'MobileTerminalOpenMultiplexSchema'
  )
  assertShape(open, ['bulkTicket', 'bulkEndpoint', 'expiresAt', 'maxFrameBytes'])
  const invocation = requireObject(
    schemas.MobileTerminalMultiplexInvocationSchema,
    'MobileTerminalMultiplexInvocationSchema'
  )
  assertShape(invocation, ['i', 'p'])
  const peerMessage = requireObject(
    schemas.MobileTerminalMultiplexPeerMessageSchema,
    'MobileTerminalMultiplexPeerMessageSchema'
  )
  assertShape(peerMessage, ['i', 't', 'p'], ['i', 'p'])
  const stream = readStreamRecordContract(schemas, domains.TERMINAL_MULTIPLEX_STREAM_RECORD_WIRE)

  const opcodes = Object.entries(domains.TerminalMultiplexOpcode)
  if (
    opcodes.length === 0 ||
    opcodes.some(([, value]) => !Number.isInteger(value) || value < 0 || value > 0xff) ||
    new Set(opcodes.map(([, value]) => value)).size !== opcodes.length
  ) {
    throw new Error('Terminal multiplex opcodes must remain unique u8 values')
  }
  requireNonnegativeIntegerTree(
    domains.TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE,
    'TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE'
  )
  requireNonnegativeIntegerTree(
    domains.TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE,
    'TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE'
  )
  requireNonnegativeIntegerTree(
    domains.TERMINAL_MULTIPLEX_SNAPSHOT_RECORD_WIRE,
    'TERMINAL_MULTIPLEX_SNAPSHOT_RECORD_WIRE'
  )
  return {
    ...domains,
    ...displayMode,
    opcodes,
    stream
  }
}

export function renderTerminalWireContract(contract, schemas) {
  const opcodeCases = contract.opcodes
    .map(([name, value]) => `    case ${lowerFirst(name)} = ${value}`)
    .join('\n')
  const connection = contract.TERMINAL_MULTIPLEX_CONNECTION_RECORD_WIRE
  const flow = contract.TERMINAL_MULTIPLEX_FLOW_RECORD_WIRE
  const snapshot = contract.TERMINAL_MULTIPLEX_SNAPSHOT_RECORD_WIRE
  const stream = contract.stream
  const invocation = renderTerminalBulkInvocation(schemas)
  const displayMode = renderTerminalDisplayModeWire(contract)
  const handshakeCases = Object.entries(connection.phase)
    .map(([name, value]) => `    case ${name} = ${value}`)
    .join('\n')
  const appStateCases = Object.entries(connection.appState)
    .map(([name, value]) => `    case ${name} = ${value}`)
    .join('\n')
  return `struct MobileRuntimeStatusWire: Codable, Equatable, Sendable {
    let runtimeId: String
    let capabilities: [String]?
}

struct MobileTerminalListRequestWire: Codable, Equatable, Sendable {
    let worktree: String?
    let limit: Int?
    let requireFreshPtyLiveness: Bool?
}

struct MobileTerminalSummaryWire: Codable, Equatable, Sendable {
    let handle: String
    let ptyId: String?
    let worktreeId: String
    let worktreeInstanceId: String?
    let worktreePath: String
    let branch: String
    let tabId: String
    let leafId: String
    let title: String?
    let connected: Bool
    let writable: Bool
    let lastOutputAt: Int64?
    let preview: String
}

struct MobileTerminalListWire: Codable, Equatable, Sendable {
    let terminals: [MobileTerminalSummaryWire]
    let totalCount: Int
    let truncated: Bool
}

struct MobileTerminalHandleRequestWire: Codable, Equatable, Sendable {
    let terminal: String
}

struct MobileTerminalShowWire: Codable, Equatable, Sendable {
    let handle: String
    let ptyId: String?
    let worktreeId: String
    let worktreeInstanceId: String?
    let worktreePath: String
    let branch: String
    let tabId: String
    let leafId: String
    let title: String?
    let connected: Bool
    let writable: Bool
    let lastOutputAt: Int64?
    let preview: String
    let paneRuntimeId: Int
    let rendererGraphEpoch: Int64
    let transportGeneration: String
}

${displayMode}

struct MobileTerminalOpenMultiplexRequestWire: Codable, Equatable, Sendable {
    let environmentId: String
    let clientInstanceId: String
}

struct MobileTerminalOpenMultiplexWire: Codable, Equatable, Sendable {
    let bulkTicket: String
    let bulkEndpoint: String
    let expiresAt: Int64
    let maxFrameBytes: Int
}

enum MobileTerminalWireContract {
    static let statusPath = ${JSON.stringify(contract.MOBILE_STATUS_GET_ORPC_PATH)}
    static let listPath = ${JSON.stringify(contract.MOBILE_TERMINAL_LIST_ORPC_PATH)}
    static let showPath = ${JSON.stringify(contract.MOBILE_TERMINAL_SHOW_ORPC_PATH)}
    static let setDisplayModePath = ${JSON.stringify(contract.MOBILE_TERMINAL_SET_DISPLAY_MODE_ORPC_PATH)}
    static let openMultiplexPath = ${JSON.stringify(contract.MOBILE_TERMINAL_OPEN_MULTIPLEX_ORPC_PATH)}
    static let multiplexPath = ${JSON.stringify(contract.MOBILE_TERMINAL_MULTIPLEX_ORPC_PATH)}
    static let multiplexCapability = ${JSON.stringify(contract.TERMINAL_MULTIPLEX_RUNTIME_CAPABILITY)}
}

enum TerminalMultiplexOpcodeWire: UInt8, Sendable {
${opcodeCases}
}

enum MobileTerminalMultiplexWireContract {
    static let kind: UInt8 = ${contract.TERMINAL_MULTIPLEX_KIND}
    static let version: UInt8 = ${contract.TERMINAL_MULTIPLEX_VERSION}
    static let headerBytes = ${contract.TERMINAL_MULTIPLEX_HEADER_BYTES}
    static let defaultMaxFrameBytes = ${contract.TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES}
    static let hardMaxFrameBytes = ${contract.TERMINAL_MULTIPLEX_HARD_MAX_FRAME_BYTES}
    static let sideChannelKind: UInt8 = ${contract.RUNTIME_ORPC_SIDE_CHANNEL_BINARY_KIND}
    static let sideChannelVersion: UInt8 = ${contract.RUNTIME_ORPC_SIDE_CHANNEL_BINARY_VERSION}
    static let sideChannelHeaderBytes = ${contract.RUNTIME_ORPC_SIDE_CHANNEL_HEADER_BYTES}
}

enum TerminalMultiplexHandshakePhase: UInt8, Sendable {
${handshakeCases}
}

enum TerminalMultiplexAppState: UInt8, Sendable {
${appStateCases}
}

enum TerminalMultiplexEpochRecordWire {
${renderSwiftConstants(connection.epoch)}
}

enum TerminalMultiplexHeartbeatRecordWire {
${renderSwiftConstants(connection.heartbeat)}
}

enum TerminalMultiplexBooleanWire {
${renderSwiftConstants(flow.boolean)}
}

enum TerminalMultiplexAckRecordWire {
${renderSwiftConstants(flow.ack)}
}

enum TerminalMultiplexCreditRecordWire {
${renderSwiftConstants(flow.credit)}
}

enum TerminalMultiplexVisibilityRecordWire {
${renderSwiftConstants(flow.visibility)}
}

enum TerminalMultiplexKillRecordWire {
${renderSwiftConstants(flow.kill)}
}

enum TerminalMultiplexInputRecordWire {
${renderSwiftConstants(flow.input)}
}

enum TerminalMultiplexSnapshotStartRecordWire {
${renderSwiftConstants(snapshot.start)}
}

enum TerminalMultiplexSnapshotChunkRecordWire {
${renderSwiftConstants(snapshot.chunk)}
}

enum TerminalMultiplexSnapshotEndRecordWire {
${renderSwiftConstants(snapshot.end)}
}

enum TerminalMultiplexCrc32cWire {
    static let polynomial: UInt32 = ${contract.TERMINAL_MULTIPLEX_CRC32C_POLYNOMIAL}
}

${renderTerminalStreamRecords(stream)}

${invocation}
`
}

function readStreamRecordContract(schemas, wire) {
  const definitions = [
    ['TerminalMultiplexViewportRecordSchema', ['cols', 'rows']],
    ['TerminalMultiplexClientRecordSchema', ['id', 'type']],
    ['TerminalMultiplexDeliveryRecordSchema', ['visible', 'interested', 'priority']],
    [
      'TerminalMultiplexCapabilitiesRecordSchema',
      ['dualScreenSnapshot', 'parseAck', 'explicitWriteAck']
    ],
    [
      'TerminalMultiplexSubscribeRecordSchema',
      [
        'terminal',
        'transportGeneration',
        'client',
        'viewport',
        'lastParsedSeq',
        'delivery',
        'snapshotMaxBytes',
        'capabilities'
      ],
      [
        'terminal',
        'transportGeneration',
        'client',
        'lastParsedSeq',
        'delivery',
        'snapshotMaxBytes',
        'capabilities'
      ]
    ],
    [
      'TerminalMultiplexSubscribedRecordSchema',
      [
        'terminal',
        'transportGeneration',
        'ptyState',
        'cols',
        'rows',
        'displayMode',
        'driver',
        'initialState',
        'snapshotId',
        'truncated'
      ],
      [
        'terminal',
        'transportGeneration',
        'ptyState',
        'cols',
        'rows',
        'displayMode',
        'driver',
        'initialState',
        'truncated'
      ]
    ],
    ['TerminalMultiplexResizeRecordSchema', ['cols', 'rows', 'reason']],
    ['TerminalMultiplexErrorRecordSchema', ['message'], []],
    ['TerminalMultiplexRevealRecordSchema', ['stateVersion']],
    [
      'TerminalMultiplexSnapshotRequestRecordSchema',
      ['requestedScrollbackRows', 'snapshotMaxBytes'],
      ['requestedScrollbackRows']
    ],
    ['TerminalMultiplexEndRecordSchema', ['exitCode', 'reason', 'historyKept']],
    ['TerminalMultiplexModelRestoreRecordSchema', ['reason', 'markerSeq', 'snapshotFollows']]
  ]
  const objects = Object.fromEntries(
    definitions.map(([name, keys, required]) => {
      const schema = requireObject(schemas[name], name)
      assertShape(schema, keys, required)
      return [name, schema]
    })
  )
  requireNonnegativeIntegerTree(wire, 'TERMINAL_MULTIPLEX_STREAM_RECORD_WIRE')
  const enumValues = (schemaName, key) =>
    requireStringEnum(objects[schemaName].properties[key], `${schemaName}.${key}`)
  const literalValue = (schemaName, key) =>
    requireIntegerLiteral(objects[schemaName].properties[key], `${schemaName}.${key}`)
  const drivers = readTerminalDriverContract(
    objects.TerminalMultiplexSubscribedRecordSchema.properties.driver,
    'TerminalMultiplexSubscribedRecordSchema.driver'
  )
  return {
    wire,
    clientTypes: enumValues('TerminalMultiplexClientRecordSchema', 'type'),
    deliveryPriorities: enumValues('TerminalMultiplexDeliveryRecordSchema', 'priority'),
    capabilityValues: {
      dualScreenSnapshot: literalValue(
        'TerminalMultiplexCapabilitiesRecordSchema',
        'dualScreenSnapshot'
      ),
      parseAck: literalValue('TerminalMultiplexCapabilitiesRecordSchema', 'parseAck'),
      explicitWriteAck: literalValue(
        'TerminalMultiplexCapabilitiesRecordSchema',
        'explicitWriteAck'
      )
    },
    ptyStates: enumValues('TerminalMultiplexSubscribedRecordSchema', 'ptyState'),
    displayModes: enumValues('TerminalMultiplexSubscribedRecordSchema', 'displayMode'),
    drivers,
    initialStates: enumValues('TerminalMultiplexSubscribedRecordSchema', 'initialState'),
    resizeReasons: enumValues('TerminalMultiplexResizeRecordSchema', 'reason'),
    endReasons: enumValues('TerminalMultiplexEndRecordSchema', 'reason'),
    restoreReasons: enumValues('TerminalMultiplexModelRestoreRecordSchema', 'reason')
  }
}

function requireStringEnum(schema, name) {
  if (!schema || schema.type !== 'string' || !Array.isArray(schema.enum)) {
    throw new Error(`${name} must remain a string enum`)
  }
  return schema.enum.map((value) => {
    if (typeof value !== 'string') {
      throw new Error(`${name} must contain only strings`)
    }
    return value
  })
}

function requireIntegerLiteral(schema, name) {
  if (
    !schema ||
    (schema.type !== 'integer' && schema.type !== 'number') ||
    !Number.isInteger(schema.const)
  ) {
    throw new Error(`${name} must remain an integer literal`)
  }
  return schema.const
}

function renderSwiftConstants(values) {
  return Object.entries(values)
    .map(([name, value]) => `    static let ${name} = ${value}`)
    .join('\n')
}

function lowerFirst(value) {
  return `${value.charAt(0).toLowerCase()}${value.slice(1)}`
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || value.type !== 'object' || !value.properties) {
    throw new Error(`${name} must remain an object schema`)
  }
  return value
}

function assertShape(schema, expectedKeys, requiredKeys = expectedKeys) {
  const actualKeys = Object.keys(schema.properties).sort()
  const expected = [...expectedKeys].sort()
  if (JSON.stringify(actualKeys) !== JSON.stringify(expected)) {
    throw new Error(`Terminal wire properties changed: ${actualKeys.join(', ')}`)
  }
  const actualRequired = [...(schema.required ?? [])].sort()
  const required = [...requiredKeys].sort()
  if (JSON.stringify(actualRequired) !== JSON.stringify(required)) {
    throw new Error(`Terminal wire required fields changed: ${actualRequired.join(', ')}`)
  }
}

function requireNonnegativeIntegerTree(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must remain an object of wire constants`)
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'object') {
      requireNonnegativeIntegerTree(item, `${name}.${key}`)
    } else if (!Number.isInteger(item) || item < 0) {
      throw new Error(`${name}.${key} must remain a nonnegative integer`)
    }
  }
}
