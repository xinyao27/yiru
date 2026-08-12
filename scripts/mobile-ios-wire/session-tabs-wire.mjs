export function loadSessionTabsWireSource(packageRequire, z) {
  const source = packageRequire('@yiru/runtime-protocol/mobile-session-tabs-wire')
  const schemas = {
    MobileSessionTabsWorktreeRequestSchema: z.toJSONSchema(
      source.MobileSessionTabsWorktreeRequestSchema
    ),
    MobileSessionTabMutationRequestSchema: z.toJSONSchema(
      source.MobileSessionTabMutationRequestSchema
    ),
    MobileSessionCreateTerminalRequestSchema: z.toJSONSchema(
      source.MobileSessionCreateTerminalRequestSchema
    ),
    MobileSessionTabsWireSchema: z.toJSONSchema(source.MobileSessionTabsWireSchema),
    MobileSessionCreateTerminalResultWireSchema: z.toJSONSchema(
      source.MobileSessionCreateTerminalResultWireSchema
    ),
    MobileSessionTabCloseResultWireSchema: z.toJSONSchema(
      source.MobileSessionTabCloseResultWireSchema
    ),
    MobileSessionTabsEventWireSchema: z.toJSONSchema(source.MobileSessionTabsEventWireSchema)
  }
  const domains = {
    MOBILE_SESSION_TABS_LIST_ORPC_PATH: source.MOBILE_SESSION_TABS_LIST_ORPC_PATH,
    MOBILE_SESSION_TABS_SUBSCRIBE_ORPC_PATH: source.MOBILE_SESSION_TABS_SUBSCRIBE_ORPC_PATH,
    MOBILE_SESSION_TABS_ACTIVATE_ORPC_PATH: source.MOBILE_SESSION_TABS_ACTIVATE_ORPC_PATH,
    MOBILE_SESSION_TABS_CLOSE_ORPC_PATH: source.MOBILE_SESSION_TABS_CLOSE_ORPC_PATH,
    MOBILE_SESSION_TABS_CREATE_TERMINAL_ORPC_PATH:
      source.MOBILE_SESSION_TABS_CREATE_TERMINAL_ORPC_PATH
  }
  return { schemas, domains, contract: readSessionTabsContract(schemas, domains) }
}

export function renderSessionTabsWireContract(contract) {
  const tabTypeCases = contract.tabTypes
    .map((value) => `    case ${swiftCase(value)} = ${JSON.stringify(value)}`)
    .join('\n')
  const terminalStatusCases = contract.terminalStatuses
    .map((value) => `    case ${swiftCase(value)} = ${JSON.stringify(value)}`)
    .join('\n')
  const viewModeCases = contract.viewModes
    .map((value) => `    case ${swiftCase(value)} = ${JSON.stringify(value)}`)
    .join('\n')
  return `enum MobileSessionTabTypeWire: String, Decodable, Sendable {
${tabTypeCases}
}

enum MobileSessionTerminalStatusWire: String, Decodable, Sendable {
${terminalStatusCases}
}

enum MobileSessionTerminalViewModeWire: String, Decodable, Sendable {
${viewModeCases}
}

struct MobileSessionTabsWorktreeRequestWire: Encodable, Sendable {
    let worktree: String
}

struct MobileSessionTabMutationRequestWire: Encodable, Sendable {
    let worktree: String
    let tabId: String
    let leafId: String?
    let notifyClients: Bool?
}

struct MobileSessionCreateTerminalRequestWire: Encodable, Sendable {
    let worktree: String
    let afterTabId: String?
    let activate: Bool?
    let clientMutationId: String?
}

struct MobileSessionTabWire: Decodable, Sendable {
    let id: String
    let title: String
    let isActive: Bool
    let color: String?
    let isPinned: Bool?
    let type: MobileSessionTabTypeWire
    let parentTabId: String?
    let leafId: String?
    let ptyId: String?
    let viewMode: MobileSessionTerminalViewModeWire?
    let status: MobileSessionTerminalStatusWire?
    let terminal: String?
    let worktreeInstanceId: String?
    let filePath: String?
    let relativePath: String?
    let isDirty: Bool?
    let browserPageId: String?
    let url: String?
    let loading: Bool?
}

struct MobileSessionTabsWire: Decodable, Sendable {
    let worktree: String
    let publicationEpoch: String
    let snapshotVersion: Int64
    let activeTabId: String?
    let activeTabType: MobileSessionTabTypeWire?
    let tabs: [MobileSessionTabWire]
}

struct MobileSessionCreateTerminalResultWire: Decodable, Sendable {
    let tab: MobileSessionTabWire
    let publicationEpoch: String
    let snapshotVersion: Int64
}

struct MobileSessionTabCloseResultWire: Decodable, Sendable {
    let closed: Bool
}

enum MobileSessionTabsEventWire: Decodable, Sendable {
    case snapshot(MobileSessionTabsWire)
    case updated(MobileSessionTabsWire)
    case end

    private enum EventType: String, Decodable {
        case snapshot
        case updated
        case end
    }

    private enum CodingKeys: String, CodingKey {
        case type
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(EventType.self, forKey: .type) {
        case .snapshot:
            self = .snapshot(try MobileSessionTabsWire(from: decoder))
        case .updated:
            self = .updated(try MobileSessionTabsWire(from: decoder))
        case .end:
            self = .end
        }
    }
}

enum MobileSessionTabsWireContract {
    static let listPath = ${JSON.stringify(contract.listPath)}
    static let subscribePath = ${JSON.stringify(contract.subscribePath)}
    static let activatePath = ${JSON.stringify(contract.activatePath)}
    static let closePath = ${JSON.stringify(contract.closePath)}
    static let createTerminalPath = ${JSON.stringify(contract.createTerminalPath)}
}`
}

function readSessionTabsContract(schemas, domains) {
  assertObjectShape(
    schemas.MobileSessionTabsWorktreeRequestSchema,
    ['worktree'],
    ['worktree'],
    'MobileSessionTabsWorktreeRequestSchema'
  )
  assertObjectShape(
    schemas.MobileSessionTabMutationRequestSchema,
    ['worktree', 'tabId', 'leafId', 'notifyClients'],
    ['worktree', 'tabId'],
    'MobileSessionTabMutationRequestSchema'
  )
  assertObjectShape(
    schemas.MobileSessionCreateTerminalRequestSchema,
    ['worktree', 'afterTabId', 'activate', 'clientMutationId'],
    ['worktree'],
    'MobileSessionCreateTerminalRequestSchema'
  )
  const tabs = requireObject(schemas.MobileSessionTabsWireSchema, 'MobileSessionTabsWireSchema')
  assertObjectShape(
    tabs,
    ['worktree', 'publicationEpoch', 'snapshotVersion', 'activeTabId', 'activeTabType', 'tabs'],
    ['worktree', 'publicationEpoch', 'snapshotVersion', 'activeTabId', 'activeTabType', 'tabs'],
    'MobileSessionTabsWireSchema'
  )
  assertObjectShape(
    schemas.MobileSessionCreateTerminalResultWireSchema,
    ['tab', 'publicationEpoch', 'snapshotVersion'],
    ['tab', 'publicationEpoch', 'snapshotVersion'],
    'MobileSessionCreateTerminalResultWireSchema'
  )
  assertObjectShape(
    schemas.MobileSessionTabCloseResultWireSchema,
    ['closed'],
    ['closed'],
    'MobileSessionTabCloseResultWireSchema'
  )
  assertSessionTabsEvent(schemas.MobileSessionTabsEventWireSchema, tabs)

  const variants = flattenVariants(tabs.properties.tabs?.items)
  const tabTypes = [
    ...new Set(variants.map((schema) => requireStringConst(schema.properties.type)))
  ]
  const expectedTabTypes = ['terminal', 'markdown', 'file', 'browser']
  if (JSON.stringify(tabTypes) !== JSON.stringify(expectedTabTypes)) {
    throw new Error(`Mobile session tab kinds changed: ${tabTypes.join(', ')}`)
  }
  const terminalVariants = variants.filter(
    (schema) => requireStringConst(schema.properties.type) === 'terminal'
  )
  if (terminalVariants.length !== 2) {
    throw new Error('Mobile terminal tabs must retain pending and ready variants')
  }
  const terminalStatuses = terminalVariants.map((schema) =>
    requireStringConst(schema.properties.status)
  )
  if (JSON.stringify(terminalStatuses) !== JSON.stringify(['pending-handle', 'ready'])) {
    throw new Error(`Mobile terminal tab statuses changed: ${terminalStatuses.join(', ')}`)
  }
  const viewModes = requireStringEnum(terminalVariants[0].properties.viewMode)
  const nextViewModes = requireStringEnum(terminalVariants[1].properties.viewMode)
  if (JSON.stringify(viewModes) !== JSON.stringify(nextViewModes)) {
    throw new Error('Mobile terminal view modes differ between pending and ready tabs')
  }
  for (const variant of variants) {
    assertVariant(variant)
  }
  return {
    tabTypes,
    terminalStatuses,
    viewModes,
    listPath: domains.MOBILE_SESSION_TABS_LIST_ORPC_PATH,
    subscribePath: domains.MOBILE_SESSION_TABS_SUBSCRIBE_ORPC_PATH,
    activatePath: domains.MOBILE_SESSION_TABS_ACTIVATE_ORPC_PATH,
    closePath: domains.MOBILE_SESSION_TABS_CLOSE_ORPC_PATH,
    createTerminalPath: domains.MOBILE_SESSION_TABS_CREATE_TERMINAL_ORPC_PATH
  }
}

function assertSessionTabsEvent(value, tabs) {
  const variants = value?.oneOf ?? value?.anyOf
  if (!Array.isArray(variants) || variants.length !== 3) {
    throw new Error('MobileSessionTabsEventWireSchema must retain three variants')
  }
  const byType = new Map(
    variants.map((variant) => {
      const schema = requireObject(variant, 'mobile session tabs event')
      return [requireStringConst(schema.properties.type), schema]
    })
  )
  for (const type of ['snapshot', 'updated']) {
    const schema = byType.get(type)
    if (!schema) {
      throw new Error(`MobileSessionTabsEventWireSchema is missing ${type}`)
    }
    assertObjectShape(
      schema,
      [...Object.keys(tabs.properties), 'type'],
      [...(tabs.required ?? []), 'type'],
      `MobileSessionTabsEventWireSchema.${type}`
    )
  }
  const end = byType.get('end')
  if (!end) {
    throw new Error('MobileSessionTabsEventWireSchema is missing end')
  }
  assertObjectShape(end, ['type'], ['type'], 'MobileSessionTabsEventWireSchema.end')
}

function assertVariant(schema) {
  const type = requireStringConst(schema.properties.type)
  const common = ['id', 'title', 'isActive', 'color', 'isPinned', 'type']
  switch (type) {
    case 'terminal':
      assertObjectShape(
        schema,
        [
          ...common,
          'parentTabId',
          'leafId',
          'ptyId',
          'viewMode',
          'status',
          'terminal',
          ...(requireStringConst(schema.properties.status) === 'ready'
            ? ['worktreeInstanceId']
            : [])
        ],
        [
          ...common.filter((key) => key !== 'color' && key !== 'isPinned'),
          'parentTabId',
          'leafId',
          'status',
          'terminal'
        ],
        `MobileSessionTabWireSchema.${type}.${requireStringConst(schema.properties.status)}`
      )
      return
    case 'markdown':
    case 'file':
      assertObjectShape(
        schema,
        [...common, 'filePath', 'relativePath', 'isDirty'],
        [
          ...common.filter((key) => key !== 'color' && key !== 'isPinned'),
          'filePath',
          'relativePath',
          'isDirty'
        ],
        `MobileSessionTabWireSchema.${type}`
      )
      return
    case 'browser':
      assertObjectShape(
        schema,
        [...common, 'browserPageId', 'url', 'loading'],
        [
          ...common.filter((key) => key !== 'color' && key !== 'isPinned'),
          'browserPageId',
          'url',
          'loading'
        ],
        'MobileSessionTabWireSchema.browser'
      )
  }
}

function flattenVariants(items) {
  if (!items || !Array.isArray(items.anyOf)) {
    throw new Error('MobileSessionTabsWireSchema.tabs must remain a union array')
  }
  return items.anyOf.flatMap((schema) => {
    if (Array.isArray(schema.oneOf)) {
      return schema.oneOf.map((variant) => requireObject(variant, 'terminal tab variant'))
    }
    return [requireObject(schema, 'session tab variant')]
  })
}

function assertObjectShape(value, expectedKeys, requiredKeys, name) {
  const schema = requireObject(value, name)
  const actual = Object.keys(schema.properties).sort()
  const expected = [...expectedKeys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} properties changed: ${actual.join(', ')}`)
  }
  const actualRequired = [...(schema.required ?? [])].sort()
  const required = [...requiredKeys].sort()
  if (JSON.stringify(actualRequired) !== JSON.stringify(required)) {
    throw new Error(`${name} required fields changed: ${actualRequired.join(', ')}`)
  }
}

function requireObject(value, name) {
  if (!value || value.type !== 'object' || !value.properties) {
    throw new Error(`${name} must remain an object schema`)
  }
  return value
}

function requireStringConst(value) {
  if (!value || value.type !== 'string' || typeof value.const !== 'string') {
    throw new Error('Mobile session tab discriminator must remain a string literal')
  }
  return value.const
}

function requireStringEnum(value) {
  if (!value || value.type !== 'string' || !Array.isArray(value.enum)) {
    throw new Error('Mobile terminal view mode must remain a string enum')
  }
  return value.enum
}

function swiftCase(value) {
  const words = value.split('-')
  return `${words[0]}${words
    .slice(1)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join('')}`
}
