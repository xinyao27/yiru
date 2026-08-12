export function readTerminalDriverContract(schema, name) {
  if (!schema || !Array.isArray(schema.oneOf) || schema.oneOf.length === 0) {
    throw new Error(`${name} must remain a discriminated union`)
  }
  const variants = schema.oneOf.flatMap((value, index) =>
    readVariant(value, `${name}.oneOf[${index}]`)
  )
  if (new Set(variants.map(({ kind }) => kind)).size !== variants.length) {
    throw new Error(`${name} discriminator values must remain unique`)
  }
  return variants
}

function readVariant(value, name) {
  const variant = requireObject(value, name)
  if (variant.additionalProperties !== false) {
    throw new Error(`${name} must reject additional properties`)
  }
  const hasClientID = Object.hasOwn(variant.properties, 'clientId')
  assertShape(variant, hasClientID ? ['kind', 'clientId'] : ['kind'], name)
  const kindSchema = variant.properties.kind
  const kinds = kindSchema.const
    ? [requireStringLiteral(kindSchema, `${name}.kind`)]
    : requireStringEnum(kindSchema, `${name}.kind`)
  if (hasClientID) {
    const clientID = variant.properties.clientId
    if (!clientID || clientID.type !== 'string' || clientID.minLength !== 1) {
      throw new Error(`${name}.clientId must remain a nonempty string`)
    }
  }
  return kinds.map((kind) => ({ kind, hasClientID }))
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || value.type !== 'object' || !value.properties) {
    throw new Error(`${name} must remain an object schema`)
  }
  return value
}

function assertShape(schema, expectedKeys, name) {
  const actualKeys = Object.keys(schema.properties).sort()
  const expected = [...expectedKeys].sort()
  if (JSON.stringify(actualKeys) !== JSON.stringify(expected)) {
    throw new Error(`${name} properties changed: ${actualKeys.join(', ')}`)
  }
  const required = [...(schema.required ?? [])].sort()
  if (JSON.stringify(required) !== JSON.stringify(expected)) {
    throw new Error(`${name} required fields changed: ${required.join(', ')}`)
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

function requireStringLiteral(schema, name) {
  if (!schema || schema.type !== 'string' || typeof schema.const !== 'string') {
    throw new Error(`${name} must remain a string literal`)
  }
  return schema.const
}
