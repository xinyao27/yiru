const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync
} = require('node:fs')
const { dirname, join, posix, resolve } = require('node:path')
const { builtinModules, createRequire } = require('node:module')

const projectDir = resolve(__dirname, '..')
const requireFromProject = createRequire(join(projectDir, 'package.json'))

const PACKAGED_RUNTIME_PACKAGE_ROOTS = [
  '@electron-toolkit/utils',
  // Why: main/CLI keep oRPC as bare requires after the host RPC migration.
  '@orpc/client',
  '@orpc/server',
  '@parcel/watcher',
  // Why: the plain-tsc CLI preserves these workspace imports as bare requires.
  '@yiru/mobile-relay-protocol',
  '@yiru/runtime-protocol',
  '@yiru/workbench-model',
  'electron-updater',
  'jsonc-parser',
  'node-pty',
  'posthog-node',
  // serve-sim (for CLI JS entry + closure + state/middleware + to make packaged require('serve-sim') + its internal relatives work; mirrors other runtime JS like ws/yaml/zod. Natives/dylibs still via extraResources + the node_modules/serve-sim copy in resources from builder. Client if added too.
  'serve-sim',
  'qrcode',
  'tweetnacl',
  // Why: main-process HTTP uses undici's EnvHttpProxyAgent as a bare require.
  'undici',
  'ws',
  'yaml',
  'zod'
]

const NODE_PTY_PREBUILD_PREFIX_BY_PLATFORM = {
  darwin: 'darwin-',
  linux: 'linux-',
  win32: 'win32-'
}
const NODE_PTY_CONPTY_RUNTIME_FILES = ['conpty.dll', 'OpenConsole.exe']
const PARCEL_WATCHER_PLATFORM_PREFIX_BY_PLATFORM = {
  darwin: 'watcher-darwin',
  linux: 'watcher-linux',
  win32: 'watcher-win32'
}
const TYPE_DECLARATION_ARTIFACT_RE = /\.d\.(?:c|m)?ts(?:\.map)?$/

const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`)
])

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/')
    return scope && name ? `${scope}/${name}` : specifier
  }
  return specifier.split('/')[0]
}

function isPackagedExternalSpecifier(specifier) {
  return (
    !specifier.startsWith('.') &&
    !specifier.startsWith('/') &&
    specifier !== 'electron' &&
    !NODE_BUILTINS.has(specifier)
  )
}

function findPackageJsonByNodeModulesWalk(packageName, fromDir) {
  // Why: walk ancestors the way Node resolves bare imports. pnpm often places a
  // dependency in a parent node_modules (sibling of @scope/), and types-only
  // packages like type-fest have no require()-able entry or package.json export.
  let dir = fromDir
  while (dir !== dirname(dir)) {
    const candidate = join(dir, 'node_modules', packageName, 'package.json')
    if (existsSync(candidate)) {
      return candidate
    }
    dir = dirname(dir)
  }
  return null
}

function resolvePackageJsonPath(packageName, fromDir = projectDir) {
  const nested = findPackageJsonByNodeModulesWalk(packageName, fromDir)
  if (nested) {
    return nested
  }
  // Why: published serve-sim has no "." export (only ./middleware and ./state), so
  // require.resolve('serve-sim') fails even though the package is present for bridge exec.
  if (packageName === 'serve-sim') {
    const direct = join(projectDir, 'node_modules', 'serve-sim', 'package.json')
    if (existsSync(direct)) {
      return direct
    }
  }
  try {
    return requireFromProject.resolve(`${packageName}/package.json`, { paths: [fromDir] })
  } catch {
    let entryPath
    try {
      entryPath = requireFromProject.resolve(packageName, { paths: [fromDir] })
    } catch {
      throw new Error(`Could not resolve package ${packageName} from ${fromDir}`)
    }
    let dir = dirname(entryPath)
    while (dir !== dirname(dir)) {
      const packageJsonPath = join(dir, 'package.json')
      if (existsSync(packageJsonPath)) {
        return packageJsonPath
      }
      dir = dirname(dir)
    }
    throw new Error(`Could not find package.json for ${packageName}`)
  }
}

function readPackage(packageName, fromDir = projectDir) {
  const packageJsonPath = resolvePackageJsonPath(packageName, fromDir)
  const packageDir = realpathSync(dirname(packageJsonPath))
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  return {
    name: packageJson.name ?? packageName,
    packageDir,
    dependencies: Object.keys(packageJson.dependencies ?? {})
  }
}

function isKnownOmittedServeSimDependency(packageName, fromDir) {
  if (packageName !== 'inspect-webkit') {
    return false
  }
  const serveSimPackageJsonPath = join(projectDir, 'node_modules', 'serve-sim', 'package.json')
  if (!existsSync(serveSimPackageJsonPath)) {
    return false
  }
  try {
    return realpathSync(fromDir) === realpathSync(dirname(serveSimPackageJsonPath))
  } catch {
    return false
  }
}

function collectPackagedRuntimePackages() {
  const packages = new Map()
  const visit = (packageName, fromDir = projectDir) => {
    if (packageName === 'electron' || packages.has(packageName)) {
      return
    }

    let packageInfo
    try {
      packageInfo = readPackage(packageName, fromDir)
    } catch (error) {
      // Why: serve-sim declares inspect-webkit, but current installs omit it.
      // Keep that escape hatch narrow so broken packages still fail packaging.
      if (isKnownOmittedServeSimDependency(packageName, fromDir)) {
        return
      }
      throw error
    }
    if (packages.has(packageInfo.name)) {
      return
    }
    packages.set(packageInfo.name, packageInfo.packageDir)

    for (const dependencyName of packageInfo.dependencies) {
      visit(dependencyName, packageInfo.packageDir)
    }
  }

  for (const packageName of PACKAGED_RUNTIME_PACKAGE_ROOTS) {
    visit(packageName)
  }

  // Why: @parcel/watcher loads its native .node addon from a platform-specific
  // optionalDependency (e.g. @parcel/watcher-linux-x64-glibc) that the
  // dependencies graph above never reaches. Include the ones installed for the
  // build's supported architectures; afterPack pruning trims non-target
  // platforms. Without this the packaged main bundle's import of
  // '@parcel/watcher' resolves at runtime but throws loading its binary.
  const parcelWatcherDir = packages.get('@parcel/watcher')
  if (parcelWatcherDir) {
    const parcelWatcherPackage = JSON.parse(
      readFileSync(join(parcelWatcherDir, 'package.json'), 'utf8')
    )
    for (const optionalName of Object.keys(parcelWatcherPackage.optionalDependencies ?? {})) {
      try {
        visit(optionalName)
      } catch {
        // Optional platform subpackage is not installed for this build; skip it.
      }
    }
  }

  return [...packages.entries()].sort(([left], [right]) => left.localeCompare(right))
}

function createPackagedRuntimeNodeModuleResources() {
  return collectPackagedRuntimePackages().map(([packageName, packageDir]) => ({
    from: packageDir,
    to: join('node_modules', ...packageName.split('/'))
  }))
}

function normalizeAsarEntryPath(entry) {
  return entry.replace(/\\/g, '/').replace(/^\/+/, '')
}

function findAsarEntry(entries, expectedPath) {
  return entries.find((entry) => normalizeAsarEntryPath(entry) === expectedPath)
}

function findRelativeAsarModule(entries, fromFile, specifier) {
  const basePath = posix.normalize(posix.join(posix.dirname(fromFile), specifier))
  const candidates = [basePath, `${basePath}.js`, posix.join(basePath, 'index.js')]
  return candidates.map((candidate) => findAsarEntry(entries, candidate)).find(Boolean) ?? null
}

function verifyPackagedRuntimeDeps(resourcesDir, asar = require('@electron/asar')) {
  const asarPath = join(resourcesDir, 'app.asar')
  if (!existsSync(asarPath)) {
    return
  }

  const entries = asar.listPackage(asarPath)
  const runtimeFiles = new Set([
    'out/main/index.js',
    'out/main/agent-hooks/managed-agent-hook-controls.js'
  ])
  for (const entry of entries) {
    const normalizedPath = normalizeAsarEntryPath(entry)
    if (
      normalizedPath.startsWith('out/cli/') &&
      normalizedPath.endsWith('.js') &&
      !normalizedPath.endsWith('.test.js')
    ) {
      runtimeFiles.add(normalizedPath)
    }
  }
  const missing = new Set()
  const pendingFiles = [...runtimeFiles]
  const inspectedFiles = new Set()

  while (pendingFiles.length > 0) {
    const file = pendingFiles.pop()
    if (!file || inspectedFiles.has(file)) {
      continue
    }
    inspectedFiles.add(file)
    const entry = findAsarEntry(entries, file)
    if (!entry) {
      throw new Error(`Packaged runtime file ${file} was not found in ${asarPath}`)
    }

    // Why: @electron/asar lists entries with host separators; Windows returns
    // backslashes, and extractFile expects that same host-style path.
    const internalPath = entry.replace(/^[\\/]+/, '')
    const source = asar.extractFile(asarPath, internalPath).toString('utf8')
    for (const match of source.matchAll(/require\(["']([^"']+)["']\)/g)) {
      const specifier = match[1]
      if (specifier.startsWith('.')) {
        const relativeEntry = findRelativeAsarModule(entries, file, specifier)
        if (relativeEntry) {
          pendingFiles.push(normalizeAsarEntryPath(relativeEntry))
        }
        continue
      }
      if (!isPackagedExternalSpecifier(specifier)) {
        continue
      }
      const packageName = packageNameFromSpecifier(specifier)
      if (!existsSync(join(resourcesDir, 'node_modules', ...packageName.split('/')))) {
        missing.add(packageName)
      }
    }
  }

  if (missing.size > 0) {
    throw new Error(
      `Packaged runtime files have bare imports without copied node_modules: ${[...missing].join(
        ', '
      )}`
    )
  }
}

function normalizeNodePtyWindowsArch(electronArch) {
  if (electronArch === 'x64' || electronArch === 1) {
    return 'x64'
  }
  if (electronArch === 'arm64' || electronArch === 3) {
    return 'arm64'
  }
  return process.arch === 'arm64' ? 'arm64' : 'x64'
}

function findNodePtyConptySourceDir(nodePtyDir, windowsArch) {
  const conptyRoot = join(nodePtyDir, 'third_party', 'conpty')
  if (!existsSync(conptyRoot)) {
    throw new Error(`Packaged node-pty is missing ${conptyRoot}`)
  }
  for (const entry of readdirSync(conptyRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const sourceDir = join(conptyRoot, entry.name, `win10-${windowsArch}`)
    if (existsSync(sourceDir)) {
      return sourceDir
    }
  }
  throw new Error(`Packaged node-pty has no ConPTY payload for win10-${windowsArch}`)
}

function ensurePackagedNodePtyConptyRuntime(nodePtyDir, electronArch) {
  const releaseDir = join(nodePtyDir, 'build', 'Release')
  if (!existsSync(join(releaseDir, 'conpty.node'))) {
    return
  }

  const runtimeDir = join(releaseDir, 'conpty')
  const missingRuntimeFiles = NODE_PTY_CONPTY_RUNTIME_FILES.filter(
    (filename) => !existsSync(join(runtimeDir, filename))
  )
  if (missingRuntimeFiles.length === 0) {
    return
  }

  const windowsArch = normalizeNodePtyWindowsArch(electronArch)
  const sourceDir = findNodePtyConptySourceDir(nodePtyDir, windowsArch)
  mkdirSync(runtimeDir, { recursive: true })
  for (const filename of missingRuntimeFiles) {
    const sourceFile = join(sourceDir, filename)
    if (!existsSync(sourceFile)) {
      throw new Error(`Packaged node-pty is missing ${sourceFile}`)
    }
    // Why: node-pty's Windows addon loads conpty.dll relative to conpty.node,
    // but its install script can run before electron-builder gathers resources.
    copyFileSync(sourceFile, join(runtimeDir, filename))
  }
}

function prunePackagedNodePty(resourcesDir, electronPlatformName, electronArch) {
  const nodePtyDir = join(resourcesDir, 'node_modules', 'node-pty')
  if (!existsSync(nodePtyDir)) {
    return
  }

  const allowedPrebuildPrefix = NODE_PTY_PREBUILD_PREFIX_BY_PLATFORM[electronPlatformName]
  if (allowedPrebuildPrefix) {
    const prebuildsDir = join(nodePtyDir, 'prebuilds')
    if (existsSync(prebuildsDir)) {
      for (const entry of readdirSync(prebuildsDir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith(allowedPrebuildPrefix)) {
          rmSync(join(prebuildsDir, entry.name), { recursive: true, force: true })
        }
      }
    }
  }

  if (electronPlatformName === 'win32') {
    ensurePackagedNodePtyConptyRuntime(nodePtyDir, electronArch)
  } else {
    // Why: conpty is Windows-only and node-pty resolves runtime binaries from
    // build/Release or prebuilds/<platform>-<arch>, not third_party/conpty.
    rmSync(join(nodePtyDir, 'third_party', 'conpty'), { recursive: true, force: true })
    rmSync(join(nodePtyDir, 'deps', 'winpty'), { recursive: true, force: true })
  }
}

function prunePackagedParcelWatcher(resourcesDir, electronPlatformName) {
  const parcelDir = join(resourcesDir, 'node_modules', '@parcel')
  if (!existsSync(parcelDir)) {
    return
  }

  // Why: we package every installed @parcel/watcher-<platform> optional
  // subpackage (supportedArchitectures fetches all), but each build only needs
  // its own platform's binary. Keep the core package and the matching platform
  // subpackages; drop the rest so a Linux serve doesn't ship macOS/Windows .node.
  const keepPrefix = PARCEL_WATCHER_PLATFORM_PREFIX_BY_PLATFORM[electronPlatformName]
  for (const entry of readdirSync(parcelDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'watcher') {
      continue
    }
    // Why: only ever prune the watcher's own platform subpackages. Guards against
    // nuking an unrelated @parcel/* runtime dep if one is added to the roots later.
    if (!entry.name.startsWith('watcher-')) {
      continue
    }
    if (keepPrefix && entry.name.startsWith(keepPrefix)) {
      continue
    }
    rmSync(join(parcelDir, entry.name), { recursive: true, force: true })
  }
}

function prunePackagedRuntimeTypeDeclarations(resourcesDir) {
  const nodeModulesDir = join(resourcesDir, 'node_modules')
  if (!existsSync(nodeModulesDir)) {
    return
  }
  pruneMatchingFiles(nodeModulesDir, (filename) => TYPE_DECLARATION_ARTIFACT_RE.test(filename))
}

function prunePackagedZodSources(resourcesDir) {
  // Why: Zod's src tree is TypeScript source only selected by the @zod/source
  // condition; packaged runtime import/require paths resolve to built JS.
  rmSync(join(resourcesDir, 'node_modules', 'zod', 'src'), { recursive: true, force: true })
}

function prunePackagedRuntimeNodeModules(resourcesDir, electronPlatformName, electronArch) {
  prunePackagedNodePty(resourcesDir, electronPlatformName, electronArch)
  prunePackagedParcelWatcher(resourcesDir, electronPlatformName)
  prunePackagedRuntimeTypeDeclarations(resourcesDir)
  prunePackagedZodSources(resourcesDir)
}

function pruneMatchingFiles(directory, shouldPrune) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      pruneMatchingFiles(entryPath, shouldPrune)
    } else if (entry.isFile() && shouldPrune(entry.name)) {
      rmSync(entryPath, { force: true })
    }
  }
}

module.exports = {
  PACKAGED_RUNTIME_PACKAGE_ROOTS,
  createPackagedRuntimeNodeModuleResources,
  findAsarEntry,
  isPackagedExternalSpecifier,
  packageNameFromSpecifier,
  prunePackagedNodePty,
  prunePackagedParcelWatcher,
  prunePackagedRuntimeNodeModules,
  prunePackagedRuntimeTypeDeclarations,
  prunePackagedZodSources,
  verifyPackagedRuntimeDeps
}
