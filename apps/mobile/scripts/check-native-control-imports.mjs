import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

// Why: TypeScript 7 is a native CLI; AST consumers still need the legacy JavaScript API.
import ts from 'typescript-api'

import {
  bottomDrawerPaths,
  forbiddenReactNativeControls,
  isExpoUiHostModule,
  isExpoUiModule,
  isGovernedModule,
  mobileRoot,
  reactNativeControlAdapterAllowlist,
  sourceRoots,
  universalControlHostWhitelist,
  universalControlImportAllowlist,
  universalHostAdapterPaths,
  universalJsxControls
} from './native-control-import-policy.mjs'
import {
  bindingPropertyName,
  copyAlias,
  externalModuleReferenceName,
  hasJsxAncestor,
  isExportedVariableDeclaration,
  moduleNameFromCall,
  namespaceMember,
  setMapValue,
  scriptKindFor,
  unwrapExpression,
  universalControlForTag,
  visit
} from './native-control-import-syntax.mjs'

const sourceFiles = (
  await Promise.all(sourceRoots.map((sourceRoot) => collectSourceFiles(sourceRoot)))
).flat()
const violations = []
const violationKeys = new Set()

for (const filePath of sourceFiles) {
  checkSourceFile(filePath, await readFile(filePath, 'utf8'))
}

if (violations.length > 0) {
  console.error(['Mobile native-control import policy failed:', ...violations].join('\n'))
  process.exitCode = 1
} else {
  console.log(`Mobile native-control imports OK — ${sourceFiles.length} file(s) scanned.`)
}

function checkSourceFile(filePath, source) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath)
  )
  const expoUiControlsByLocalName = new Map()
  const expoUiNamespaceNames = new Set()
  const expoUiValueLocalNames = new Set()
  const expoUiHostLocalNames = new Set()
  const reactNativeControlsByLocalName = new Map()
  const reactNativeNamespaceNames = new Set()
  const variableDeclarations = []

  visit(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text
      checkModuleBoundary(filePath, sourceFile, node.moduleSpecifier, moduleName)
      collectStaticImportBindings({
        filePath,
        sourceFile,
        declaration: node,
        moduleName,
        expoUiControlsByLocalName,
        expoUiNamespaceNames,
        expoUiValueLocalNames,
        expoUiHostLocalNames,
        reactNativeControlsByLocalName,
        reactNativeNamespaceNames
      })
      return
    }

    if (ts.isImportEqualsDeclaration(node)) {
      const moduleName = externalModuleReferenceName(node.moduleReference)
      if (moduleName) {
        checkModuleBoundary(filePath, sourceFile, node.moduleReference, moduleName)
        rejectNonStaticUiLoad(filePath, sourceFile, node, moduleName, 'import = require()')
      }
      return
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const moduleName = node.moduleSpecifier.text
      checkModuleBoundary(filePath, sourceFile, node.moduleSpecifier, moduleName)
      checkReExport(filePath, sourceFile, node, moduleName)
      return
    }

    if (ts.isCallExpression(node)) {
      const moduleLoad = moduleNameFromCall(node)
      if (moduleLoad) {
        checkModuleBoundary(filePath, sourceFile, node, moduleLoad.moduleName)
        rejectNonStaticUiLoad(filePath, sourceFile, node, moduleLoad.moduleName, moduleLoad.kind)
      }
      return
    }

    if (ts.isVariableDeclaration(node)) {
      variableDeclarations.push(node)
    }
  })

  resolveNamespaceAliases({
    filePath,
    sourceFile,
    variableDeclarations,
    expoUiControlsByLocalName,
    expoUiNamespaceNames,
    expoUiValueLocalNames,
    expoUiHostLocalNames,
    reactNativeControlsByLocalName,
    reactNativeNamespaceNames
  })

  visit(sourceFile, (node) => {
    checkLocalUiExport({
      filePath,
      sourceFile,
      node,
      expoUiControlsByLocalName,
      expoUiNamespaceNames,
      expoUiValueLocalNames,
      reactNativeControlsByLocalName,
      reactNativeNamespaceNames
    })
    checkNamespaceControlAccess({
      filePath,
      sourceFile,
      node,
      expoUiControlsByLocalName,
      expoUiNamespaceNames,
      reactNativeNamespaceNames
    })

    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) {
      return
    }
    const controlName = universalControlForTag(
      node.tagName,
      expoUiControlsByLocalName,
      expoUiNamespaceNames,
      universalJsxControls
    )
    if (
      controlName &&
      !universalControlHostWhitelist.has(filePath) &&
      !hasJsxAncestor(node, expoUiHostLocalNames)
    ) {
      addViolation(
        filePath,
        sourceFile,
        node.tagName,
        `${controlName} from @expo/ui must be rendered inside ExpoUiHost`
      )
    }
  })
}

function collectStaticImportBindings(args) {
  const { declaration } = args
  const importClause = declaration.importClause
  if (!importClause || importClause.isTypeOnly) {
    return
  }

  if (importClause.name) {
    collectDefaultBinding(args, importClause.name)
  }

  const namedBindings = importClause.namedBindings
  if (namedBindings && ts.isNamespaceImport(namedBindings)) {
    collectNamespaceBinding(args, namedBindings.name)
    return
  }
  if (!namedBindings) {
    return
  }

  for (const element of namedBindings.elements) {
    if (element.isTypeOnly) {
      continue
    }
    const importedName = element.propertyName?.text ?? element.name.text
    collectNamedBinding(args, importedName, element.name.text, element)
  }
}

function collectNamespaceBinding(args, localNameNode) {
  const {
    filePath,
    sourceFile,
    moduleName,
    expoUiNamespaceNames,
    expoUiValueLocalNames,
    expoUiHostLocalNames,
    reactNativeNamespaceNames
  } = args
  if (moduleName === 'react-native') {
    reactNativeNamespaceNames.add(localNameNode.text)
  } else if (isExpoUiModule(moduleName)) {
    expoUiValueLocalNames.add(localNameNode.text)
    if (moduleName === '@expo/ui') {
      expoUiNamespaceNames.add(localNameNode.text)
    }
    addViolation(
      filePath,
      sourceFile,
      localNameNode,
      `namespace imports are not allowed for ${moduleName}; import the concrete control`
    )
  } else if (isExpoUiHostModule(moduleName)) {
    expoUiHostLocalNames.add(localNameNode.text)
  }
}

function collectDefaultBinding(args, localNameNode) {
  const { moduleName, expoUiValueLocalNames, reactNativeNamespaceNames } = args
  if (moduleName === 'react-native') {
    reactNativeNamespaceNames.add(localNameNode.text)
  } else if (isExpoUiModule(moduleName)) {
    expoUiValueLocalNames.add(localNameNode.text)
  } else if (isExpoUiHostModule(moduleName)) {
    args.expoUiHostLocalNames.add(localNameNode.text)
  }
}

function collectNamedBinding(args, importedName, localName, node) {
  const {
    filePath,
    sourceFile,
    moduleName,
    expoUiControlsByLocalName,
    expoUiValueLocalNames,
    expoUiHostLocalNames,
    reactNativeControlsByLocalName
  } = args
  if (moduleName === 'react-native' && forbiddenReactNativeControls.has(importedName)) {
    reactNativeControlsByLocalName.set(localName, importedName)
    if (isForbiddenReactNativeControl(filePath, importedName)) {
      addViolation(
        filePath,
        sourceFile,
        node,
        `import ${importedName} from @expo/ui or use the owning Yiru module`
      )
    }
    return
  }
  if (isExpoUiModule(moduleName)) {
    expoUiValueLocalNames.add(localName)
  }
  if (moduleName === '@expo/ui') {
    if (importedName === 'Host' && !universalHostAdapterPaths.has(filePath)) {
      addViolation(
        filePath,
        sourceFile,
        node,
        'Universal Host theme ownership belongs to ExpoUiHost'
      )
    } else if (universalJsxControls.has(importedName)) {
      checkUniversalControlImport(filePath, sourceFile, node, importedName)
      expoUiControlsByLocalName.set(localName, importedName)
    }
    return
  }
  if (isExpoUiHostModule(moduleName) && importedName === 'ExpoUiHost') {
    expoUiHostLocalNames.add(localName)
  }
}

function resolveNamespaceAliases(args) {
  let didChange = true
  while (didChange) {
    didChange = false
    for (const declaration of args.variableDeclarations) {
      const initializer = unwrapExpression(declaration.initializer)
      if (!initializer) {
        continue
      }
      if (ts.isIdentifier(declaration.name) && ts.isIdentifier(initializer)) {
        didChange =
          copyAlias(initializer.text, declaration.name.text, args.expoUiNamespaceNames) || didChange
        didChange =
          copyAlias(initializer.text, declaration.name.text, args.reactNativeNamespaceNames) ||
          didChange
        didChange =
          copyAlias(initializer.text, declaration.name.text, args.expoUiValueLocalNames) ||
          didChange
        didChange =
          copyAlias(initializer.text, declaration.name.text, args.expoUiHostLocalNames) || didChange
        const controlName = args.expoUiControlsByLocalName.get(initializer.text)
        if (controlName && !args.expoUiControlsByLocalName.has(declaration.name.text)) {
          args.expoUiControlsByLocalName.set(declaration.name.text, controlName)
          didChange = true
        }
        const reactNativeControlName = args.reactNativeControlsByLocalName.get(initializer.text)
        if (
          reactNativeControlName &&
          !args.reactNativeControlsByLocalName.has(declaration.name.text)
        ) {
          args.reactNativeControlsByLocalName.set(declaration.name.text, reactNativeControlName)
          didChange = true
        }
      }
      if (ts.isIdentifier(declaration.name)) {
        const member = namespaceMember(initializer)
        if (
          member &&
          args.expoUiNamespaceNames.has(member.namespaceName) &&
          universalJsxControls.has(member.memberName)
        ) {
          didChange =
            setMapValue(args.expoUiControlsByLocalName, declaration.name.text, member.memberName) ||
            didChange
        }
        if (
          member &&
          args.reactNativeNamespaceNames.has(member.namespaceName) &&
          forbiddenReactNativeControls.has(member.memberName)
        ) {
          didChange =
            setMapValue(
              args.reactNativeControlsByLocalName,
              declaration.name.text,
              member.memberName
            ) || didChange
        }
      }
      if (ts.isObjectBindingPattern(declaration.name) && ts.isIdentifier(initializer)) {
        didChange =
          resolveDestructuredNamespace(args, declaration.name, initializer.text) || didChange
      }
    }
  }
}

function resolveDestructuredNamespace(args, bindingPattern, namespaceName) {
  let didChange = false
  for (const element of bindingPattern.elements) {
    if (!ts.isIdentifier(element.name)) {
      continue
    }
    const importedName = bindingPropertyName(element)
    if (args.reactNativeNamespaceNames.has(namespaceName)) {
      if (forbiddenReactNativeControls.has(importedName)) {
        didChange =
          setMapValue(args.reactNativeControlsByLocalName, element.name.text, importedName) ||
          didChange
      }
      if (isForbiddenReactNativeControl(args.filePath, importedName)) {
        addViolation(
          args.filePath,
          args.sourceFile,
          element,
          `import ${importedName} from @expo/ui or use the owning Yiru module`
        )
      }
    } else if (args.expoUiNamespaceNames.has(namespaceName)) {
      args.expoUiValueLocalNames.add(element.name.text)
      if (importedName === 'Host' && !universalHostAdapterPaths.has(args.filePath)) {
        addViolation(
          args.filePath,
          args.sourceFile,
          element,
          'Universal Host theme ownership belongs to ExpoUiHost'
        )
      } else if (universalJsxControls.has(importedName)) {
        checkUniversalControlImport(args.filePath, args.sourceFile, element, importedName)
        didChange =
          setMapValue(args.expoUiControlsByLocalName, element.name.text, importedName) || didChange
      }
    }
  }
  return didChange
}

function checkNamespaceControlAccess(args) {
  const { node } = args
  const member = namespaceMember(node)
  if (!member) {
    return
  }
  if (
    args.reactNativeNamespaceNames.has(member.namespaceName) &&
    isForbiddenReactNativeControl(args.filePath, member.memberName)
  ) {
    addViolation(
      args.filePath,
      args.sourceFile,
      node,
      `import ${member.memberName} from @expo/ui or use the owning Yiru module`
    )
  }
  if (
    args.expoUiNamespaceNames.has(member.namespaceName) &&
    universalJsxControls.has(member.memberName)
  ) {
    checkUniversalControlImport(args.filePath, args.sourceFile, node, member.memberName)
  }
  if (
    args.expoUiNamespaceNames.has(member.namespaceName) &&
    member.memberName === 'Host' &&
    !universalHostAdapterPaths.has(args.filePath)
  ) {
    addViolation(
      args.filePath,
      args.sourceFile,
      node,
      'Universal Host theme ownership belongs to ExpoUiHost'
    )
  }
}

function checkLocalUiExport(args) {
  const { node } = args
  if (
    ts.isExportDeclaration(node) &&
    !node.moduleSpecifier &&
    node.exportClause &&
    ts.isNamedExports(node.exportClause) &&
    !node.isTypeOnly
  ) {
    for (const element of node.exportClause.elements) {
      if (!element.isTypeOnly) {
        const localName = element.propertyName?.text ?? element.name.text
        checkExportedLocalName(args, localName, element)
      }
    }
    return
  }
  if (ts.isExportAssignment(node)) {
    checkExportedExpression(args, unwrapExpression(node.expression), node)
    return
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    isExportedVariableDeclaration(node)
  ) {
    checkExportedLocalName(args, node.name.text, node.name)
  }
}

function checkExportedExpression(args, expression, node) {
  if (ts.isIdentifier(expression)) {
    checkExportedLocalName(args, expression.text, node)
    return
  }
  const member = namespaceMember(expression)
  if (
    member &&
    args.reactNativeNamespaceNames.has(member.namespaceName) &&
    forbiddenReactNativeControls.has(member.memberName)
  ) {
    addViolation(
      args.filePath,
      args.sourceFile,
      node,
      `do not re-export React Native ${member.memberName}`
    )
  }
}

function checkExportedLocalName(args, localName, node) {
  if (args.expoUiValueLocalNames.has(localName)) {
    addViolation(args.filePath, args.sourceFile, node, 'do not re-export values from @expo/ui')
    return
  }
  const controlName = args.expoUiControlsByLocalName.get(localName)
  const reactNativeControlName = args.reactNativeControlsByLocalName.get(localName)
  if (controlName) {
    addViolation(args.filePath, args.sourceFile, node, `do not re-export @expo/ui ${controlName}`)
  } else if (reactNativeControlName) {
    addViolation(
      args.filePath,
      args.sourceFile,
      node,
      `do not re-export React Native ${reactNativeControlName}`
    )
  } else if (args.expoUiNamespaceNames.has(localName)) {
    addViolation(args.filePath, args.sourceFile, node, 'do not re-export the @expo/ui namespace')
  } else if (args.reactNativeNamespaceNames.has(localName)) {
    addViolation(
      args.filePath,
      args.sourceFile,
      node,
      'do not re-export the react-native namespace'
    )
  }
}

function checkModuleBoundary(filePath, sourceFile, node, moduleName) {
  const isBottomSheetModule = moduleName.startsWith('@expo/ui/community/bottom-sheet')
  if (moduleName.startsWith('@expo/ui/swift-ui') && !filePath.endsWith('.ios.tsx')) {
    addViolation(filePath, sourceFile, node, 'SwiftUI imports belong in an .ios.tsx implementation')
  }
  if (moduleName.startsWith('@expo/ui/jetpack-compose') && !filePath.endsWith('.android.tsx')) {
    addViolation(
      filePath,
      sourceFile,
      node,
      'Compose imports belong in an .android.tsx implementation'
    )
  }
  if (isBottomSheetModule && !bottomDrawerPaths.has(filePath)) {
    addViolation(
      filePath,
      sourceFile,
      node,
      'use BottomDrawer so native sheet lifecycle stays centralized'
    )
  }
}

function checkReExport(filePath, sourceFile, declaration, moduleName) {
  if (declaration.isTypeOnly) {
    return
  }
  const exportClause = declaration.exportClause
  if (!exportClause || ts.isNamespaceExport(exportClause)) {
    if (moduleName === 'react-native' || isExpoUiModule(moduleName)) {
      addViolation(
        filePath,
        sourceFile,
        declaration,
        `do not re-export governed controls from ${moduleName}`
      )
    }
    return
  }
  for (const element of exportClause.elements) {
    if (element.isTypeOnly) {
      continue
    }
    const importedName = element.propertyName?.text ?? element.name.text
    if (isExpoUiModule(moduleName)) {
      addViolation(filePath, sourceFile, element, `do not re-export values from ${moduleName}`)
      continue
    }
    if (
      importedName === 'default' &&
      (moduleName === 'react-native' || moduleName === '@expo/ui')
    ) {
      addViolation(
        filePath,
        sourceFile,
        element,
        `do not re-export the ${moduleName} default namespace`
      )
    }
    if (moduleName === 'react-native' && forbiddenReactNativeControls.has(importedName)) {
      addViolation(filePath, sourceFile, element, `do not re-export React Native ${importedName}`)
    }
    if (
      moduleName === '@expo/ui' &&
      (importedName === 'Host' || universalJsxControls.has(importedName))
    ) {
      addViolation(filePath, sourceFile, element, `do not re-export @expo/ui ${importedName}`)
    }
  }
}

function rejectNonStaticUiLoad(filePath, sourceFile, node, moduleName, kind) {
  if (isGovernedModule(moduleName)) {
    addViolation(
      filePath,
      sourceFile,
      node,
      `${kind} is not allowed for ${moduleName}; use a static import so native-control policy remains auditable`
    )
  }
}

function checkUniversalControlImport(filePath, sourceFile, node, controlName) {
  const allowlist = universalControlImportAllowlist.get(controlName)
  if (allowlist && !allowlist.has(filePath)) {
    addViolation(
      filePath,
      sourceFile,
      node,
      `direct @expo/ui ${controlName} use is not allowed; use the owning Yiru module`
    )
  }
}

function isForbiddenReactNativeControl(filePath, controlName) {
  return (
    forbiddenReactNativeControls.has(controlName) &&
    !reactNativeControlAdapterAllowlist.get(filePath)?.has(controlName)
  )
}

function addViolation(filePath, sourceFile, node, message) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  const relativePath = path.relative(mobileRoot, filePath).split(path.sep).join('/')
  const violation = `${relativePath}:${line + 1}:${character + 1}: ${message}`
  if (!violationKeys.has(violation)) {
    violationKeys.add(violation)
    violations.push(violation)
  }
}

async function collectSourceFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const nestedFiles = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directoryPath, entry.name)
      if (entry.isDirectory()) {
        return collectSourceFiles(entryPath)
      }
      return entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) ? [entryPath] : []
    })
  )
  return nestedFiles.flat()
}
