import path from 'node:path'

// Why: TypeScript 7 is a native CLI; AST consumers still need the legacy JavaScript API.
import ts from 'typescript-api'

export function visit(node, callback) {
  callback(node)
  ts.forEachChild(node, (child) => visit(child, callback))
}

export function namespaceMember(node) {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    return { namespaceName: node.expression.text, memberName: node.name.text }
  }
  if (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.argumentExpression &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return { namespaceName: node.expression.text, memberName: node.argumentExpression.text }
  }
  return undefined
}

export function universalControlForTag(
  tagName,
  controlsByLocalName,
  namespaceNames,
  universalControls
) {
  if (ts.isIdentifier(tagName)) {
    return controlsByLocalName.get(tagName.text)
  }
  const member = namespaceMember(tagName)
  return member &&
    namespaceNames.has(member.namespaceName) &&
    universalControls.has(member.memberName)
    ? member.memberName
    : undefined
}

export function hasJsxAncestor(node, localNames) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isJsxElement(parent) &&
      ts.isIdentifier(parent.openingElement.tagName) &&
      localNames.has(parent.openingElement.tagName.text)
    ) {
      return true
    }
  }
  return false
}

export function moduleNameFromCall(node) {
  const [argument] = node.arguments
  if (!argument || !ts.isStringLiteralLike(argument)) {
    return undefined
  }
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return { kind: 'import()', moduleName: argument.text }
  }
  if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
    return { kind: 'require()', moduleName: argument.text }
  }
  return undefined
}

export function externalModuleReferenceName(moduleReference) {
  return ts.isExternalModuleReference(moduleReference) &&
    moduleReference.expression &&
    ts.isStringLiteralLike(moduleReference.expression)
    ? moduleReference.expression.text
    : undefined
}

export function bindingPropertyName(element) {
  const propertyName = element.propertyName
  return propertyName && (ts.isIdentifier(propertyName) || ts.isStringLiteralLike(propertyName))
    ? propertyName.text
    : element.name.text
}

export function unwrapExpression(expression) {
  let current = expression
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current))
  ) {
    current = current.expression
  }
  return current
}

export function isExportedVariableDeclaration(declaration) {
  const statement = declaration.parent?.parent
  return (
    statement &&
    ts.isVariableStatement(statement) &&
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  )
}

export function scriptKindFor(filePath) {
  const extension = path.extname(filePath)
  if (extension === '.tsx') {
    return ts.ScriptKind.TSX
  }
  if (extension === '.jsx') {
    return ts.ScriptKind.JSX
  }
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
    return ts.ScriptKind.JS
  }
  return ts.ScriptKind.TS
}

export function copyAlias(sourceName, targetName, names) {
  if (!names.has(sourceName) || names.has(targetName)) {
    return false
  }
  names.add(targetName)
  return true
}

export function setMapValue(map, key, value) {
  if (map.get(key) === value) {
    return false
  }
  map.set(key, value)
  return true
}
