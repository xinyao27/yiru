import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import ts from 'typescript-api'

import {
  ORPC_ROUTER_PATH,
  REPO_ROOT,
  bindingsFor,
  compareText,
  evaluateStatic,
  fail,
  importBinding,
  listTypeScriptFiles,
  loadSourceFile,
  objectProperty,
  propertyName,
  repoPath,
  resolveExpression,
  sourceLocation,
  stringUnionValues,
  unwrapExpression
} from './syntax-reader.mjs'

const LEGACY_METHODS_DIR = path.join(REPO_ROOT, 'apps/desktop/src/main/runtime/rpc/methods')
const ORPC_CONTRACT_DIR = path.join(REPO_ROOT, 'packages/runtime-protocol/src/contract')
const ACCESS_META_PATH = path.join(ORPC_CONTRACT_DIR, 'access-meta.ts')
const LEGACY_CORE_PATH = path.join(REPO_ROOT, 'apps/desktop/src/main/runtime/rpc/core.ts')
const INVENTORY_PATH = path.join(REPO_ROOT, 'scripts/rpc-access-inventory/inventory.generated.json')
const INVENTORY_DISPLAY_PATH = path.relative(REPO_ROOT, INVENTORY_PATH).split(path.sep).join('/')

const ACCESS_SCOPES = stringUnionValues(ACCESS_META_PATH, 'RpcAccessScope')
const ACCESS_TIERS = stringUnionValues(ACCESS_META_PATH, 'RpcAccessTier')
const CALLER_CLASSES = stringUnionValues(ACCESS_META_PATH, 'RpcCallerClass')
const SOURCE_KIND_ORDER = { legacy: 0, orpc: 1 }

function normalizeAccess(value, file, node) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('RPC access must be an object literal or const object', file, node)
  }
  const { scope, tier, principals } = value
  if (typeof scope !== 'string' || !ACCESS_SCOPES.has(scope)) {
    fail(`Invalid RPC access scope: ${String(scope)}`, file, node)
  }
  if (typeof tier !== 'string' || !ACCESS_TIERS.has(tier)) {
    fail(`Invalid RPC access tier: ${String(tier)}`, file, node)
  }
  if (principals !== undefined) {
    if (
      !Array.isArray(principals) ||
      principals.some(
        (principal) => typeof principal !== 'string' || !CALLER_CLASSES.has(principal)
      )
    ) {
      fail('Invalid RPC access principals', file, node)
    }
  }
  return {
    scope,
    tier,
    ...(principals === undefined ? {} : { principals: [...new Set(principals)].sort(compareText) })
  }
}

function contractDescriptor(reference) {
  const resolved = resolveExpression(reference)
  const { file } = resolved
  const node = unwrapExpression(resolved.node)
  if (ts.isObjectLiteralExpression(node)) {
    return { file, node }
  }
  if (ts.isCallExpression(node)) {
    for (const argument of [...node.arguments].toReversed()) {
      const candidate = resolveExpression({ file, node: argument })
      if (ts.isObjectLiteralExpression(candidate.node)) {
        return candidate
      }
    }
  }
  fail('Legacy contract must resolve to a static descriptor object', file, node)
}

function readBoolean(reference, label) {
  const value = evaluateStatic(reference)
  if (typeof value !== 'boolean') {
    fail(`${label} must resolve to a boolean`, reference.file, reference.node)
  }
  return value
}

function legacyEntry(file, call, streaming) {
  const argument = call.arguments[0]
  const spec = argument ? resolveExpression({ file, node: argument }) : null
  if (!spec || !ts.isObjectLiteralExpression(spec.node)) {
    fail('defineMethod requires a static object argument', file, call)
  }
  const nameProperty = objectProperty(spec.node, 'name', spec.file)
  const contractProperty = objectProperty(spec.node, 'contract', spec.file)
  if (Boolean(nameProperty) === Boolean(contractProperty)) {
    fail('defineMethod must declare exactly one of name or contract', spec.file, spec.node)
  }
  let method
  let mobile
  if (contractProperty) {
    const descriptor = contractDescriptor({ file: spec.file, node: contractProperty })
    const contractName = objectProperty(descriptor.node, 'name', descriptor.file)
    const contractMobile = objectProperty(descriptor.node, 'mobile', descriptor.file)
    if (!contractName || !contractMobile) {
      fail('Legacy contract must declare name and mobile', descriptor.file, descriptor.node)
    }
    method = evaluateStatic({ file: descriptor.file, node: contractName })
    mobile = readBoolean({ file: descriptor.file, node: contractMobile }, 'Contract mobile')
  } else {
    method = evaluateStatic({ file: spec.file, node: nameProperty })
    const mobileProperty = objectProperty(spec.node, 'mobile', spec.file)
    mobile = mobileProperty
      ? readBoolean({ file: spec.file, node: mobileProperty }, 'Method mobile')
      : false
  }
  if (typeof method !== 'string' || method.length === 0) {
    fail('RPC method name must resolve to a non-empty string', spec.file, spec.node)
  }
  const accessProperty = objectProperty(spec.node, 'access', spec.file)
  if (!accessProperty) {
    fail(`Missing access on ${method}`, spec.file, spec.node)
  }
  return {
    method,
    access: normalizeAccess(
      evaluateStatic({ file: spec.file, node: accessProperty }),
      spec.file,
      accessProperty
    ),
    mobile,
    streaming,
    kind: 'legacy',
    file: repoPath(file),
    location: sourceLocation(file, call)
  }
}

function callBinding(file, expression, trail = new Set()) {
  const callee = unwrapExpression(expression)
  if (ts.isIdentifier(callee)) {
    const key = `${file}#${callee.text}`
    if (trail.has(key)) {
      fail(`Circular callable alias ${callee.text}`, file, callee)
    }
    const imported = importBinding(file, callee.text)
    if (imported) {
      return imported
    }
    const local = bindingsFor(file).declarations.get(callee.text)
    if (local) {
      return callBinding(file, local, new Set([...trail, key]))
    }
    return null
  }
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    const namespace = importBinding(file, callee.expression.text)
    if (!namespace || namespace.name !== '*') {
      return null
    }
    return { ...namespace, name: callee.name.text }
  }
  return null
}

function registrationKind(file, expression) {
  const binding = callBinding(file, expression)
  if (binding?.file !== LEGACY_CORE_PATH) {
    return null
  }
  return binding.name === 'defineMethod'
    ? 'method'
    : binding.name === 'defineStreamingMethod'
      ? 'streaming'
      : null
}

function collectLegacyEntries() {
  const entries = []
  for (const file of listTypeScriptFiles(LEGACY_METHODS_DIR)) {
    const sourceFile = loadSourceFile(file)
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const kind = registrationKind(file, node.expression)
        if (kind === 'method') {
          entries.push(legacyEntry(file, node, false))
        } else if (kind === 'streaming') {
          entries.push(legacyEntry(file, node, true))
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return entries
}

function withAccessCall(reference) {
  const resolved = resolveExpression(reference)
  const { file } = resolved
  const node = unwrapExpression(resolved.node)
  if (!ts.isCallExpression(node)) {
    return null
  }
  const callee = unwrapExpression(node.expression)
  const binding = callBinding(file, callee)
  if (binding?.file === ACCESS_META_PATH && binding.name === 'withAccess') {
    return { file, node }
  }
  if (ts.isPropertyAccessExpression(callee)) {
    return withAccessCall({ file, node: callee.expression })
  }
  return null
}

function containsEventIterator(file, node) {
  if (ts.isCallExpression(node)) {
    const binding = callBinding(file, node.expression)
    if (binding?.module === '@orpc/contract' && binding.name === 'eventIterator') {
      return true
    }
  }
  return node.getChildren().some((child) => containsEventIterator(file, child))
}

function hasEventIteratorOutput(reference) {
  const resolved = resolveExpression(reference)
  const { file } = resolved
  const node = unwrapExpression(resolved.node)
  if (!ts.isCallExpression(node)) {
    return false
  }
  const callee = unwrapExpression(node.expression)
  if (ts.isPropertyAccessExpression(callee)) {
    if (
      callee.name.text === 'output' &&
      node.arguments.some((argument) => containsEventIterator(file, argument))
    ) {
      return true
    }
    return hasEventIteratorOutput({ file, node: callee.expression })
  }
  return false
}

function routerFactoryObject(reference) {
  const resolved = resolveExpression(reference)
  const call = unwrapExpression(resolved.node)
  if (!ts.isCallExpression(call)) {
    return null
  }
  const callee = unwrapExpression(call.expression)
  if (!ts.isIdentifier(callee)) {
    return null
  }
  const sourceFile = loadSourceFile(resolved.file)
  const factory = sourceFile.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === callee.text
  )
  if (!factory?.body) {
    return null
  }
  const returns = factory.body.statements.filter(ts.isReturnStatement)
  if (returns.length !== 1 || !returns[0].expression) {
    return null
  }
  const output = unwrapExpression(returns[0].expression)
  return ts.isObjectLiteralExpression(output) ? { file: resolved.file, node: output } : null
}

function orpcEntry(pathParts, propertyFile, propertyNode, builder, procedureReference) {
  const accessArgument = builder.node.arguments[0]
  if (!accessArgument) {
    fail('withAccess requires an access declaration', builder.file, builder.node)
  }
  const optionsArgument = builder.node.arguments[1]
  const options = optionsArgument
    ? evaluateStatic({ file: builder.file, node: optionsArgument })
    : {}
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    fail('withAccess options must resolve to an object', builder.file, optionsArgument)
  }
  const mobile = options.mobile ?? false
  if (typeof mobile !== 'boolean') {
    fail(
      'withAccess mobile must resolve to a boolean',
      builder.file,
      optionsArgument ?? builder.node
    )
  }
  const legacyMethod = options.legacyMethod
  if (
    legacyMethod !== undefined &&
    (typeof legacyMethod !== 'string' || legacyMethod.length === 0)
  ) {
    fail(
      'withAccess legacyMethod must resolve to a non-empty string',
      builder.file,
      optionsArgument ?? builder.node
    )
  }
  return {
    method: pathParts.join('.'),
    ...(legacyMethod === undefined ? {} : { legacyMethod }),
    access: normalizeAccess(
      evaluateStatic({ file: builder.file, node: accessArgument }),
      builder.file,
      accessArgument
    ),
    mobile,
    streaming: hasEventIteratorOutput(procedureReference),
    kind: 'orpc',
    file: repoPath(propertyFile),
    location: sourceLocation(propertyFile, propertyNode)
  }
}

function collectOrpcEntries() {
  const routerBindings = bindingsFor(ORPC_ROUTER_PATH)
  const runtimeContract = routerBindings.declarations.get('runtimeContract')
  if (!runtimeContract) {
    throw new Error(`runtimeContract is missing from ${repoPath(ORPC_ROUTER_PATH)}`)
  }
  const entries = []
  function visit(reference, pathParts) {
    const builder = withAccessCall(reference)
    if (builder) {
      if (pathParts.length === 0) {
        fail('oRPC procedure cannot be the root router', builder.file, builder.node)
      }
      entries.push(orpcEntry(pathParts, reference.file, reference.node, builder, reference))
      return
    }
    // Why: provider families share a contract factory so access and operation
    // declarations stay single-source; inventory still requires its returned
    // router to be a static top-level object literal.
    const resolved = routerFactoryObject(reference) ?? resolveExpression(reference)
    if (!ts.isObjectLiteralExpression(resolved.node)) {
      fail(
        'oRPC router members must resolve to a router object or withAccess procedure',
        resolved.file,
        resolved.node
      )
    }
    for (const property of resolved.node.properties) {
      if (ts.isPropertyAssignment(property)) {
        visit({ file: resolved.file, node: property.initializer }, [
          ...pathParts,
          propertyName(property.name, resolved.file)
        ])
      } else if (ts.isShorthandPropertyAssignment(property)) {
        visit({ file: resolved.file, node: property.name }, [...pathParts, property.name.text])
      } else {
        fail('oRPC inventory does not allow router spreads or methods', resolved.file, property)
      }
    }
  }
  visit({ file: ORPC_ROUTER_PATH, node: runtimeContract }, [])
  return entries
}

function semanticDescriptor(entry) {
  return JSON.stringify({
    access: entry.access,
    mobile: entry.mobile,
    streaming: entry.streaming
  })
}

function mergeEntries(entries) {
  const grouped = new Map()
  for (const entry of entries) {
    const wireMethod = entry.kind === 'orpc' ? (entry.legacyMethod ?? entry.method) : entry.method
    const group = grouped.get(wireMethod) ?? []
    group.push(entry)
    grouped.set(wireMethod, group)
  }
  const methods = []
  const errors = []
  for (const wireMethod of [...grouped.keys()].sort(compareText)) {
    const group = grouped.get(wireMethod)
    for (const kind of ['legacy', 'orpc']) {
      const sameKind = group.filter((entry) => entry.kind === kind)
      if (sameKind.length > 1) {
        errors.push(
          `${wireMethod} is declared ${sameKind.length} times in ${kind}: ${sameKind.map((entry) => entry.location).join(', ')}`
        )
      }
    }
    const expected = semanticDescriptor(group[0])
    if (group.some((entry) => semanticDescriptor(entry) !== expected)) {
      errors.push(
        [
          `${wireMethod} disagrees across inventory sources:`,
          ...group.map((entry) => `  ${entry.kind} ${entry.location} ${semanticDescriptor(entry)}`)
        ].join('\n')
      )
      continue
    }
    const contractEntry = group.find((entry) => entry.kind === 'orpc')
    const sources = group
      .map(({ kind, file }) => ({ kind, file }))
      .sort(
        (left, right) =>
          SOURCE_KIND_ORDER[left.kind] - SOURCE_KIND_ORDER[right.kind] ||
          compareText(left.file, right.file)
      )
    methods.push({
      method: contractEntry?.method ?? wireMethod,
      ...(contractEntry?.legacyMethod === undefined
        ? {}
        : { legacyMethod: contractEntry.legacyMethod }),
      access: group[0].access,
      mobile: group[0].mobile,
      streaming: group[0].streaming,
      sources
    })
  }
  if (errors.length > 0) {
    throw new Error(`RPC inventory conflicts:\n\n${errors.join('\n\n')}`)
  }
  return methods.sort((left, right) => compareText(left.method, right.method))
}

function assertContractInventoryBijection(orpcEntries, methods) {
  const contractMethods = new Set(orpcEntries.map((entry) => entry.method))
  const inventoryMethods = new Set(methods.map((entry) => entry.method))
  const errors = []
  if (contractMethods.size !== orpcEntries.length) {
    errors.push(
      `contract has ${orpcEntries.length} leaves but only ${contractMethods.size} unique paths`
    )
  }
  if (inventoryMethods.size !== methods.length) {
    errors.push(`inventory has ${methods.length} entries but only ${inventoryMethods.size} paths`)
  }
  const missing = [...contractMethods].filter((method) => !inventoryMethods.has(method))
  const extra = [...inventoryMethods].filter((method) => !contractMethods.has(method))
  if (missing.length > 0) {
    errors.push(`inventory is missing contract paths: ${missing.sort(compareText).join(', ')}`)
  }
  if (extra.length > 0) {
    errors.push(`inventory has non-contract paths: ${extra.sort(compareText).join(', ')}`)
  }
  if (errors.length > 0) {
    throw new Error(`RPC contract/inventory bijection failed:\n${errors.join('\n')}`)
  }
}

function serializeInventory() {
  const legacyEntries = collectLegacyEntries()
  const orpcEntries = collectOrpcEntries()
  const methods = mergeEntries([...legacyEntries, ...orpcEntries])
  assertContractInventoryBijection(orpcEntries, methods)
  const serialized = JSON.stringify(
    {
      schemaVersion: 2,
      methodCount: methods.length,
      sourceCounts: {
        legacy: legacyEntries.length,
        orpc: orpcEntries.length
      },
      methods
    },
    null,
    2
  )
  const formatted = serialized.replace(
    /"principals": \[\n((?:\s+"(?:[^"\\]|\\.)+",?\n)+)\s+\]/g,
    (_match, body) => {
      const principals = body
        .trim()
        .split('\n')
        .map((line) => line.trim().replace(/,$/, ''))
      return `"principals": [${principals.join(', ')}]`
    }
  )
  return `${formatted}\n`
}

function isSameInventory(existing, expected) {
  if (existing === null) {
    return false
  }
  try {
    return JSON.stringify(JSON.parse(existing)) === JSON.stringify(JSON.parse(expected))
  } catch {
    return false
  }
}

function main() {
  const isWrite = process.argv.includes('--write')
  const isCheck = process.argv.includes('--check')
  if (isWrite === isCheck) {
    console.error('Choose exactly one mode: --write or --check')
    process.exitCode = 1
    return
  }
  let serialized
  try {
    serialized = serializeInventory()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }
  const inventory = JSON.parse(serialized)
  if (isWrite) {
    fs.writeFileSync(INVENTORY_PATH, serialized)
    console.log(
      `Wrote ${inventory.methodCount} methods (${inventory.sourceCounts.legacy} legacy, ${inventory.sourceCounts.orpc} oRPC) to ${INVENTORY_DISPLAY_PATH}`
    )
    return
  }
  const existing = fs.existsSync(INVENTORY_PATH) ? fs.readFileSync(INVENTORY_PATH, 'utf8') : null
  if (!isSameInventory(existing, serialized)) {
    console.error(`${INVENTORY_DISPLAY_PATH} is stale.`)
    console.error('Run: vp run generate:rpc-access-inventory')
    process.exitCode = 1
    return
  }
  console.log(
    `RPC access inventory current: ${inventory.methodCount} methods (${inventory.sourceCounts.legacy} legacy, ${inventory.sourceCounts.orpc} oRPC).`
  )
}

main()
