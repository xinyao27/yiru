import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript-api'

export const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
export const ORPC_ROUTER_PATH = path.join(
  REPO_ROOT,
  'packages/runtime-protocol/src/contract/router.ts'
)
const RUNTIME_PROTOCOL_ROOT = path.join(REPO_ROOT, 'packages/runtime-protocol')
const RUNTIME_PROTOCOL_PACKAGE = JSON.parse(
  fs.readFileSync(path.join(RUNTIME_PROTOCOL_ROOT, 'package.json'), 'utf8')
)

const sourceFiles = new Map()
const bindingsByFile = new Map()

export const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0)
export const repoPath = (file) => path.relative(REPO_ROOT, file).split(path.sep).join('/')

export function sourceLocation(file, node) {
  const sourceFile = loadSourceFile(file)
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return `${repoPath(file)}:${line + 1}`
}

export function fail(message, file, node) {
  const suffix = file && node ? ` (${sourceLocation(file, node)})` : ''
  throw new Error(`${message}${suffix}`)
}

export function listTypeScriptFiles(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(target))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(target)
    }
  }
  return files.sort(compareText)
}

export function loadSourceFile(file) {
  const absolute = path.resolve(file)
  const existing = sourceFiles.get(absolute)
  if (existing) {
    return existing
  }
  if (!fs.existsSync(absolute)) {
    throw new Error(`Source file does not exist: ${repoPath(absolute)}`)
  }
  const sourceFile = ts.createSourceFile(
    absolute,
    fs.readFileSync(absolute, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const parseError = sourceFile.parseDiagnostics[0]
  if (parseError) {
    const message = ts.flattenDiagnosticMessageText(parseError.messageText, '\n')
    const position = parseError.start ?? 0
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(position)
    throw new Error(`${repoPath(absolute)}:${line + 1}:${character + 1} ${message}`)
  }
  sourceFiles.set(absolute, sourceFile)
  return sourceFile
}

function moduleFile(containingFile, specifier) {
  let base
  if (specifier.startsWith('.')) {
    const sourceSpecifier = specifier.endsWith('.js') ? specifier.slice(0, -3) : specifier
    base = path.resolve(path.dirname(containingFile), sourceSpecifier)
  } else if (specifier.startsWith('~main/')) {
    base = path.join(REPO_ROOT, 'apps/desktop/src/main', specifier.slice('~main/'.length))
  } else if (specifier.startsWith('~shared/')) {
    base = path.join(REPO_ROOT, 'apps/desktop/src/shared', specifier.slice('~shared/'.length))
  } else if (specifier.startsWith('@yiru/runtime-protocol/')) {
    const subpath = `./${specifier.slice('@yiru/runtime-protocol/'.length)}`
    const typesTarget = RUNTIME_PROTOCOL_PACKAGE.exports?.[subpath]?.types
    return typeof typesTarget === 'string' ? path.resolve(RUNTIME_PROTOCOL_ROOT, typesTarget) : null
  } else {
    return null
  }
  const candidates = [`${base}.ts`, path.join(base, 'router.ts'), path.join(base, 'index.ts')]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

export function bindingsFor(file) {
  const absolute = path.resolve(file)
  const existing = bindingsByFile.get(absolute)
  if (existing) {
    return existing
  }
  const declarations = new Map()
  const imports = new Map()
  const sourceFile = loadSourceFile(absolute)
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          declarations.set(declaration.name.text, declaration.initializer)
        }
      }
      continue
    }
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue
    }
    const module = statement.moduleSpecifier.text
    const targetFile = moduleFile(absolute, module)
    const namedBindings = statement.importClause?.namedBindings
    if (!namedBindings) {
      continue
    }
    if (ts.isNamespaceImport(namedBindings)) {
      imports.set(namedBindings.name.text, { file: targetFile, module, name: '*' })
      continue
    }
    for (const element of namedBindings.elements) {
      imports.set(element.name.text, {
        file: targetFile,
        module,
        name: element.propertyName?.text ?? element.name.text
      })
    }
  }
  const bindings = { declarations, imports }
  bindingsByFile.set(absolute, bindings)
  return bindings
}

export function importBinding(file, name) {
  return bindingsFor(file).imports.get(name) ?? null
}

export function unwrapExpression(node) {
  let current = node
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression
  }
  return current
}

export function resolveExpression(reference, trail = new Set()) {
  const node = unwrapExpression(reference.node)
  if (!ts.isIdentifier(node)) {
    return { file: reference.file, node }
  }
  const key = `${path.resolve(reference.file)}#${node.text}`
  if (trail.has(key)) {
    fail(`Circular static binding for ${node.text}`, reference.file, node)
  }
  const nextTrail = new Set(trail)
  nextTrail.add(key)
  const bindings = bindingsFor(reference.file)
  const local = bindings.declarations.get(node.text)
  if (local) {
    return resolveExpression({ file: reference.file, node: local }, nextTrail)
  }
  const imported = bindings.imports.get(node.text)
  if (imported?.file && imported.name !== '*') {
    return resolveImportedExpression(imported, reference, node, nextTrail)
  }
  return { file: reference.file, node }
}

function resolveImportedExpression(imported, reference, node, trail) {
  const targetBindings = bindingsFor(imported.file)
  const target = targetBindings.declarations.get(imported.name)
  if (target) {
    return resolveExpression({ file: imported.file, node: target }, trail)
  }
  const forwarded = targetBindings.imports.get(imported.name)
  if (forwarded?.file && forwarded.name !== '*') {
    return resolveImportedExpression(forwarded, reference, node, trail)
  }
  fail(`Cannot resolve imported binding ${node.text}`, reference.file, node)
}

export function propertyName(name, file) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  fail('Computed property names are not supported in the RPC inventory', file, name)
}

export function objectProperty(object, key, file) {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && propertyName(property.name, file) === key) {
      return property.initializer
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === key) {
      return property.name
    }
  }
  return null
}

export function evaluateStatic(reference, trail = new Set()) {
  const resolved = resolveExpression(reference, trail)
  const { file } = resolved
  const node = unwrapExpression(resolved.node)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text)
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const value = evaluateStatic({ file, node: node.operand }, trail)
    if (typeof value === 'number') {
      return -value
    }
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => evaluateStatic({ file, node: element }, trail))
  }
  if (ts.isObjectLiteralExpression(node)) {
    const value = {}
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spread = evaluateStatic({ file, node: property.expression }, trail)
        if (!spread || typeof spread !== 'object' || Array.isArray(spread)) {
          fail('RPC inventory object spread must resolve to an object', file, property)
        }
        Object.assign(value, spread)
        continue
      }
      if (ts.isPropertyAssignment(property)) {
        value[propertyName(property.name, file)] = evaluateStatic(
          { file, node: property.initializer },
          trail
        )
        continue
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        value[property.name.text] = evaluateStatic({ file, node: property.name }, trail)
        continue
      }
      fail('Unsupported property in static RPC inventory metadata', file, property)
    }
    return value
  }
  fail('RPC inventory metadata must be statically evaluable', file, node)
}

export function stringUnionValues(file, aliasName) {
  const sourceFile = loadSourceFile(file)
  const declaration = sourceFile.statements.find(
    (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === aliasName
  )
  if (!declaration || !ts.isTypeAliasDeclaration(declaration)) {
    throw new Error(`${aliasName} is missing from ${repoPath(file)}`)
  }
  const members = ts.isUnionTypeNode(declaration.type) ? declaration.type.types : [declaration.type]
  const values = members.map((member) => {
    if (!ts.isLiteralTypeNode(member) || !ts.isStringLiteral(member.literal)) {
      fail(`${aliasName} must be a string literal union`, file, member)
    }
    return member.literal.text
  })
  return new Set(values)
}
