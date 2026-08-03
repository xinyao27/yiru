import path from 'node:path'
import process from 'node:process'

// TypeScript 7 is a native CLI; AST consumers still need the legacy JavaScript API.
import ts from 'typescript-api'

/**
 * The string-classification pass behind both localization gates.
 *
 * Why: what counts as user-visible copy is a repository-wide contract, not
 * desktop-specific policy. Desktop's renderer audit, mobile's Expo audit, and the
 * desktop auto-localizer all share this classifier so they can never disagree;
 * each caller keeps only its own roots, areas, baseline, and CLI.
 */

const LOCALIZATION_CALL_NAMES = new Set(['t', 'translate'])
const USER_VISIBLE_JSX_ATTRIBUTES = new Set([
  // Why: React Native has no aria-* — the mobile app's screen-reader copy rides on
  // accessibility* props, and this classifier gates both clients.
  'accessibilityHint',
  'accessibilityLabel',
  'ariaLabel',
  'aria-label',
  'aria-description',
  'alt',
  'description',
  'emptyText',
  'helperText',
  'keywords',
  'label',
  'message',
  'placeholder',
  'subtitle',
  'text',
  'title',
  'toggleDescription',
  'tooltip'
])
const USER_VISIBLE_OBJECT_KEYS = new Set([
  'accessibilityHint',
  'accessibilityLabel',
  'ariaLabel',
  'badge',
  'description',
  'emptyText',
  'error',
  'helperText',
  'keywords',
  'label',
  'message',
  'placeholder',
  'subtitle',
  'title',
  'toggleDescription',
  'tooltip'
])
const USER_VISIBLE_FUNCTION_NAMES = new Set([
  'alert',
  'confirm',
  'prompt',
  'showError',
  'showToast'
])
const USER_VISIBLE_OBJECT_METHODS = new Set([
  'error',
  'info',
  'loading',
  'message',
  'promise',
  'success',
  'warning'
])
const USER_VISIBLE_OBJECT_NAMES = new Set(['toast'])

export function toRepoRelativePath(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/')
}

function hasHumanLanguageText(text) {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length < 2) {
    return false
  }
  if (/^[\d\s!-/:-@[-`{-~]+$/.test(trimmed)) {
    return false
  }
  return /[A-Za-z\u00C0-\u024F\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(trimmed)
}

function compactText(text) {
  return text.replace(/\s+/g, ' ').trim()
}

function lineAndColumn(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return { line: position.line + 1, column: position.character + 1 }
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) {
    return name.expression.text
  }
  return undefined
}

function expressionNameText(node) {
  if (ts.isIdentifier(node)) {
    return node.text
  }
  if (ts.isPropertyAccessExpression(node)) {
    return `${expressionNameText(node.expression) ?? ''}.${node.name.text}`.replace(/^\./, '')
  }
  return undefined
}

function stringParts(node) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [{ text: node.text, dynamic: false }]
  }
  if (!ts.isTemplateExpression(node)) {
    return []
  }
  return [
    { text: node.head.text, dynamic: true },
    ...node.templateSpans.map((span) => ({ text: span.literal.text, dynamic: true }))
  ]
}

function isInsideLocalizationCall(node) {
  let current = node.parent
  while (current) {
    if (ts.isCallExpression(current)) {
      const name = expressionNameText(current.expression)
      if (name && LOCALIZATION_CALL_NAMES.has(name.split('.').at(-1) ?? name)) {
        return true
      }
    }
    current = current.parent
  }
  return false
}

function isJsxAttributeValue(node) {
  const parent = node.parent
  if (!parent) {
    return undefined
  }
  if (ts.isJsxAttribute(parent)) {
    return propertyNameText(parent.name)
  }
  if (parent && ts.isJsxExpression(parent) && parent.parent && ts.isJsxAttribute(parent.parent)) {
    return propertyNameText(parent.parent.name)
  }
  return undefined
}

function ancestorJsxAttributeName(node) {
  let current = node.parent
  while (current) {
    if (ts.isJsxAttribute(current)) {
      return propertyNameText(current.name)
    }
    if (
      ts.isJsxExpression(current) ||
      ts.isConditionalExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isBinaryExpression(current)
    ) {
      current = current.parent
      continue
    }
    return undefined
  }
  return undefined
}

function isRenderedJsxExpression(node) {
  let current = node.parent
  while (current) {
    if (ts.isJsxExpression(current)) {
      return (
        ts.isJsxElement(current.parent) ||
        ts.isJsxFragment(current.parent) ||
        ts.isJsxSelfClosingElement(current.parent)
      )
    }
    if (
      ts.isConditionalExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isTemplateExpression(current) ||
      ts.isNoSubstitutionTemplateLiteral(current)
    ) {
      if (ts.isConditionalExpression(current) && current.condition === node) {
        return false
      }
      current = current.parent
      continue
    }
    if (ts.isBinaryExpression(current)) {
      if (current.operatorToken.kind !== ts.SyntaxKind.PlusToken) {
        return false
      }
      current = current.parent
      continue
    }
    return false
  }
  return false
}

function nearestObjectPropertyName(node) {
  let current = node.parent
  while (current) {
    if (ts.isPropertyAssignment(current) || ts.isShorthandPropertyAssignment(current)) {
      return propertyNameText(current.name)
    }
    if (ts.isObjectLiteralExpression(current) || ts.isArrayLiteralExpression(current)) {
      current = current.parent
      continue
    }
    return undefined
  }
  return undefined
}

function hasAncestorObjectPropertyName(node, names) {
  let current = node.parent
  while (current) {
    if (
      (ts.isPropertyAssignment(current) || ts.isShorthandPropertyAssignment(current)) &&
      names.has(propertyNameText(current.name) ?? '')
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

function nearestAncestorObjectPropertyName(node) {
  let current = node.parent
  while (current) {
    if (ts.isPropertyAssignment(current) || ts.isShorthandPropertyAssignment(current)) {
      return propertyNameText(current.name)
    }
    current = current.parent
  }
  return undefined
}

function findAncestor(node, predicate) {
  let current = node.parent
  while (current) {
    if (predicate(current)) {
      return current
    }
    current = current.parent
  }
  return undefined
}

function isUserVisibleCallArgument(node) {
  const call = findAncestor(node, ts.isCallExpression)
  if (!call) {
    return false
  }
  const expressionName = expressionNameText(call.expression)
  if (!expressionName) {
    return false
  }
  const parts = expressionName.split('.')
  const methodName = parts.at(-1)
  const objectName = parts.at(-2)
  return (
    USER_VISIBLE_FUNCTION_NAMES.has(expressionName) ||
    USER_VISIBLE_FUNCTION_NAMES.has(methodName ?? '') ||
    (objectName !== undefined &&
      USER_VISIBLE_OBJECT_NAMES.has(objectName) &&
      USER_VISIBLE_OBJECT_METHODS.has(methodName ?? ''))
  )
}

function classifyStringNode(node) {
  if (hasAncestorObjectPropertyName(node, new Set(['className', 'classNames']))) {
    return undefined
  }

  if (
    findAncestor(
      node,
      (ancestor) =>
        ts.isBinaryExpression(ancestor) && ancestor.operatorToken.kind !== ts.SyntaxKind.PlusToken
    )
  ) {
    return undefined
  }

  const jsxAttributeName = isJsxAttributeValue(node)
  if (jsxAttributeName) {
    return USER_VISIBLE_JSX_ATTRIBUTES.has(jsxAttributeName)
      ? `jsx-attribute:${jsxAttributeName}`
      : undefined
  }

  const ancestorAttributeName = ancestorJsxAttributeName(node)
  if (ancestorAttributeName) {
    return USER_VISIBLE_JSX_ATTRIBUTES.has(ancestorAttributeName)
      ? `jsx-attribute:${ancestorAttributeName}`
      : undefined
  }

  if (ts.isJsxText(node)) {
    return 'jsx-text'
  }

  const objectPropertyName = nearestObjectPropertyName(node)
  if (objectPropertyName && !USER_VISIBLE_OBJECT_KEYS.has(objectPropertyName)) {
    return undefined
  }

  const ancestorObjectPropertyName = nearestAncestorObjectPropertyName(node)
  if (ancestorObjectPropertyName && !USER_VISIBLE_OBJECT_KEYS.has(ancestorObjectPropertyName)) {
    return undefined
  }

  if (isRenderedJsxExpression(node)) {
    return 'jsx-expression'
  }

  if (isUserVisibleCallArgument(node)) {
    return 'user-visible-call'
  }

  if (objectPropertyName) {
    return `object-property:${objectPropertyName}`
  }

  return undefined
}

// Why: the default area is the first two path segments. Each client passes its own
// grouping instead, because "which part of the app owns this copy" is per-client.
function defaultAreaForFile(relativePath) {
  return relativePath.split('/').slice(0, 2).join('/')
}

export function collectLocalizationCandidates(
  filePath,
  sourceText,
  root = process.cwd(),
  areaForFile = defaultAreaForFile
) {
  const sourceKind =
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourceKind
  )
  const reports = []
  const relativePath = toRepoRelativePath(root, filePath)

  function pushReport(node, kind, text, dynamic = false) {
    const value = compactText(text)
    if (!hasHumanLanguageText(value) || isInsideLocalizationCall(node)) {
      return
    }
    const position = lineAndColumn(sourceFile, node)
    reports.push({
      area: areaForFile(relativePath),
      filePath: relativePath,
      start: node.getStart(sourceFile),
      end: node.getEnd(),
      line: position.line,
      column: position.column,
      kind,
      text: value,
      dynamic
    })
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      pushReport(node, 'jsx-text', node.text)
      return
    }

    const kind = classifyStringNode(node)
    if (kind) {
      for (const part of stringParts(node)) {
        pushReport(node, kind, part.text, part.dynamic)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return reports
}
