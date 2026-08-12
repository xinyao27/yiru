export function readTerminalDisplayModeContract(schemas) {
  const request = requireObject(
    schemas.TerminalSetDisplayModeInputSchema,
    'TerminalSetDisplayModeInputSchema'
  )
  assertShape(request, ['terminal', 'mode', 'client', 'viewport'], ['terminal', 'mode'])
  const client = requireObject(
    request.properties.client,
    'TerminalSetDisplayModeInputSchema.client'
  )
  assertShape(client, ['id', 'type'], ['id'])
  const viewport = requireObject(
    request.properties.viewport,
    'TerminalSetDisplayModeInputSchema.viewport'
  )
  assertShape(viewport, ['cols', 'rows'])
  const result = requireObject(
    schemas.TerminalSetDisplayModeResultSchema,
    'TerminalSetDisplayModeResultSchema'
  )
  assertShape(result, ['mode', 'seq'], ['mode'])
  const displayModes = requireStringEnum(
    request.properties.mode,
    'TerminalSetDisplayModeInputSchema.mode'
  )
  const resultModes = requireStringEnum(
    result.properties.mode,
    'TerminalSetDisplayModeResultSchema.mode'
  )
  if (JSON.stringify(displayModes) !== JSON.stringify(resultModes)) {
    throw new Error('Terminal display-mode request and result enums must match')
  }
  return {
    displayModes,
    displayModeClientTypes: requireStringEnum(
      client.properties.type,
      'TerminalSetDisplayModeInputSchema.client.type'
    )
  }
}

export function renderTerminalDisplayModeWire(contract) {
  const modeCases = renderCases(contract.displayModes)
  const clientCases = renderCases(contract.displayModeClientTypes)
  return `enum MobileTerminalDisplayModeWire: String, Codable, Sendable {
${modeCases}
}

enum MobileTerminalDisplayModeClientTypeWire: String, Codable, Sendable {
${clientCases}
}

struct MobileTerminalDisplayModeClientWire: Encodable, Sendable {
    let id: String
    let type: MobileTerminalDisplayModeClientTypeWire
}

struct MobileTerminalDisplayModeViewportWire: Encodable, Sendable {
    let cols: Int
    let rows: Int
}

struct MobileTerminalSetDisplayModeRequestWire: Encodable, Sendable {
    let terminal: String
    let mode: MobileTerminalDisplayModeWire
    let client: MobileTerminalDisplayModeClientWire?
    let viewport: MobileTerminalDisplayModeViewportWire?
}

struct MobileTerminalSetDisplayModeResultWire: Decodable, Sendable {
    let mode: MobileTerminalDisplayModeWire
    let seq: Double?
}`
}

function renderCases(values) {
  return values.map((value) => `    case ${swiftCase(value)} = ${JSON.stringify(value)}`).join('\n')
}

function swiftCase(value) {
  const words = value.split('-')
  return `${words[0]}${words
    .slice(1)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join('')}`
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
    throw new Error(`${schema.title ?? 'Terminal display-mode'} properties changed`)
  }
  const actualRequired = [...(schema.required ?? [])].sort()
  const required = [...requiredKeys].sort()
  if (JSON.stringify(actualRequired) !== JSON.stringify(required)) {
    throw new Error(`${schema.title ?? 'Terminal display-mode'} required fields changed`)
  }
}

function requireStringEnum(schema, name) {
  if (!schema || schema.type !== 'string' || !Array.isArray(schema.enum)) {
    throw new Error(`${name} must remain a string enum`)
  }
  if (schema.enum.some((value) => typeof value !== 'string')) {
    throw new Error(`${name} must contain only strings`)
  }
  return schema.enum
}
