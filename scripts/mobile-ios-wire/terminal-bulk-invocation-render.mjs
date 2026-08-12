export function renderTerminalBulkInvocation(schemas) {
  const invocation = requireObject(
    schemas.MobileTerminalMultiplexInvocationSchema,
    'MobileTerminalMultiplexInvocationSchema'
  )
  const payload = requireObject(
    invocation.properties.p,
    'MobileTerminalMultiplexInvocationSchema.p'
  )
  const path = requireStringLiteral(
    payload.properties.u,
    'MobileTerminalMultiplexInvocationSchema.p.u'
  )
  const peer = requireObject(
    schemas.MobileTerminalMultiplexPeerMessageSchema,
    'MobileTerminalMultiplexPeerMessageSchema'
  )
  const peerPayload = requireObject(peer.properties.p, 'MobileTerminalMultiplexPeerMessageSchema.p')
  const peerEvents = requireStringEnum(
    peerPayload.properties.e,
    'MobileTerminalMultiplexPeerMessageSchema.p.e'
  )
  const peerData = requireObject(
    peerPayload.properties.d,
    'MobileTerminalMultiplexPeerMessageSchema.p.d'
  )
  const peerJSON = requireObject(
    peerData.properties.json,
    'MobileTerminalMultiplexPeerMessageSchema.p.d.json'
  )
  const readyType = requireStringLiteral(
    peerJSON.properties.type,
    'MobileTerminalMultiplexPeerMessageSchema.p.d.json.type'
  )
  return `enum TerminalMultiplexPeerEventKind: String, Codable, Sendable {
${peerEvents.map((value) => `    case ${value}`).join('\n')}
}

struct TerminalMultiplexInvocation: Encodable, Sendable {
    let i: String
    let p: TerminalMultiplexInvocationPayload
}

struct TerminalMultiplexInvocationPayload: Encodable, Sendable {
    let u = ${JSON.stringify(path)}
    let b: TerminalMultiplexInvocationBody
    let h: [String: String]
}

struct TerminalMultiplexInvocationBody: Encodable, Sendable {
    let json: TerminalMultiplexInvocationInput
}

struct TerminalMultiplexInvocationInput: Encodable, Sendable {
    let bulkTicket: String
}

struct TerminalMultiplexPeerMessage: Decodable, Sendable {
    let i: String
    let t: Int?
    let p: TerminalMultiplexPeerPayload
}

struct TerminalMultiplexPeerPayload: Decodable, Sendable {
    let s: Int?
    let e: TerminalMultiplexPeerEventKind?
    let d: TerminalMultiplexPeerEvent?
}

struct TerminalMultiplexPeerEvent: Decodable, Sendable {
    let json: TerminalMultiplexReadyEvent
}

struct TerminalMultiplexReadyEvent: Decodable, Sendable {
    let type: TerminalMultiplexReadyType
}

enum TerminalMultiplexReadyType: String, Codable, Sendable {
    case ${swiftCase(readyType)} = ${JSON.stringify(readyType)}
}`
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || value.type !== 'object' || !value.properties) {
    throw new Error(`${name} must remain an object schema`)
  }
  return value
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

function requireStringLiteral(schema, name) {
  if (!schema || schema.type !== 'string' || typeof schema.const !== 'string') {
    throw new Error(`${name} must remain a string literal`)
  }
  return schema.const
}

function swiftCase(value) {
  const words = value.split('-')
  return `${words[0]}${words
    .slice(1)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join('')}`
}
