export function loadTerminalWireSource(packageRequire, z) {
  const terminal = packageRequire('@yiru/runtime-protocol/mobile-terminal-wire')
  const frame = packageRequire('@yiru/runtime-protocol/terminal-multiplex/frame')
  const orpc = packageRequire('@yiru/runtime-protocol/orpc-peer-frame')
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
    MobileTerminalOpenMultiplexSchema: z.toJSONSchema(terminal.MobileTerminalOpenMultiplexSchema)
  }
  const domains = {
    MOBILE_STATUS_GET_ORPC_PATH: terminal.MOBILE_STATUS_GET_ORPC_PATH,
    MOBILE_TERMINAL_LIST_ORPC_PATH: terminal.MOBILE_TERMINAL_LIST_ORPC_PATH,
    MOBILE_TERMINAL_SHOW_ORPC_PATH: terminal.MOBILE_TERMINAL_SHOW_ORPC_PATH,
    MOBILE_TERMINAL_OPEN_MULTIPLEX_ORPC_PATH: terminal.MOBILE_TERMINAL_OPEN_MULTIPLEX_ORPC_PATH,
    MOBILE_TERMINAL_MULTIPLEX_ORPC_PATH: terminal.MOBILE_TERMINAL_MULTIPLEX_ORPC_PATH,
    TERMINAL_MULTIPLEX_KIND: frame.TERMINAL_MULTIPLEX_KIND,
    TERMINAL_MULTIPLEX_VERSION: frame.TERMINAL_MULTIPLEX_VERSION,
    TERMINAL_MULTIPLEX_HEADER_BYTES: frame.TERMINAL_MULTIPLEX_HEADER_BYTES,
    TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES: frame.TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES,
    TERMINAL_MULTIPLEX_HARD_MAX_FRAME_BYTES: frame.TERMINAL_MULTIPLEX_HARD_MAX_FRAME_BYTES,
    TerminalMultiplexOpcode: frame.TerminalMultiplexOpcode,
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

  const opcodes = Object.entries(domains.TerminalMultiplexOpcode)
  if (
    opcodes.length === 0 ||
    opcodes.some(([, value]) => !Number.isInteger(value) || value < 0 || value > 0xff) ||
    new Set(opcodes.map(([, value]) => value)).size !== opcodes.length
  ) {
    throw new Error('Terminal multiplex opcodes must remain unique u8 values')
  }
  return { ...domains, opcodes }
}

export function renderTerminalWireContract(contract) {
  const opcodeCases = contract.opcodes
    .map(([name, value]) => `    case ${lowerFirst(name)} = ${value}`)
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
    static let openMultiplexPath = ${JSON.stringify(contract.MOBILE_TERMINAL_OPEN_MULTIPLEX_ORPC_PATH)}
    static let multiplexPath = ${JSON.stringify(contract.MOBILE_TERMINAL_MULTIPLEX_ORPC_PATH)}
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
`
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
