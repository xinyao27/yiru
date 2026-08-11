// Compares every preload IPC surface against the oRPC contract procedure it is
// migrating onto, and reports fields the preload channel carries that the
// contract cannot express.
//
// Why: Phase 4 of docs/runtime-orpc-migration.md moves renderer call sites from
// `window.api.<group>.<method>(args)` onto `client.<group>.<method>(args)`. The
// contract was derived from the 445 runtime methods, while the preload face grew
// separately and is frequently *wider*. Swapping a call site then silently drops
// arguments — and nothing catches it: both sides typecheck in isolation, so
// `pnpm check` stays green while behavior narrows. Four such gaps were found by
// hand in the first six groups (preflight WSL context, sparsePresets change
// broadcast, stats unavailable variant, aiVault multi-host scope). This makes
// that comparison mechanical instead of a reading exercise.
//
// Usage:
//   node scripts/compare-preload-contract-inputs.mjs            # full report
//   node scripts/compare-preload-contract-inputs.mjs --group git
//   node scripts/compare-preload-contract-inputs.mjs --json
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const HERE = import.meta.dirname
const REPO_ROOT = resolve(HERE, '..')
const DESKTOP = resolve(REPO_ROOT, 'apps/desktop')
const API_TYPES = resolve(REPO_ROOT, 'packages/shared/src/preload/api-types.ts')

const require = createRequire(resolve(DESKTOP, 'package.json'))
// Why: the workspace pins typescript 7 (the native port), whose `typescript`
// entry exposes only version info — no JS compiler API. 6.0.3 is present in the
// store and is the one that can build a Program, which is what this needs to
// expand `PreloadApi`'s imported parameter types.
const ts = loadTypeScriptCompilerApi()

function loadTypeScriptCompilerApi() {
  const candidate = require('typescript')
  if (candidate.ScriptTarget) {
    return candidate
  }
  const legacy = resolve(REPO_ROOT, 'node_modules/.pnpm/typescript@6.0.3/node_modules/typescript')
  const loaded = createRequire(resolve(legacy, 'package.json'))('typescript')
  if (!loaded.ScriptTarget) {
    throw new Error('no TypeScript build with the JS compiler API is available')
  }
  return loaded
}

// Preload group names that do not match their contract namespace 1:1. Anything
// absent here is matched by identical name.
const GROUP_ALIASES = new Map([
  ['fs', 'files'],
  ['gh', 'github'],
  ['gl', 'gitlab'],
  ['repos', 'repo'],
  ['projects', 'project'],
  ['projectGroups', 'projectGroup'],
  ['folderWorkspaces', 'folderWorkspace'],
  ['worktrees', 'worktree'],
  ['automations', 'automation'],
  ['coworkingSharing', 'coworking'],
  ['pty', 'terminal'],
  ['hostedReview', 'hostedReview'],
  // Why: both provider account groups migrate onto the single `accounts`
  // router namespace — `accounts.ts` models Claude and Codex accounts
  // side by side rather than giving each provider its own namespace.
  ['claudeAccounts', 'accounts'],
  ['codexAccounts', 'accounts'],
  // Why: `host-capabilities.ts` groups WSL/PowerShell/Git-Bash detection
  // under the `host` namespace as sub-objects, while the preload face
  // exposes each as its own top-level group with identical member names.
  ['wsl', 'host.wsl'],
  ['pwsh', 'host.pwsh'],
  ['gitBash', 'host.gitBash'],
  // Why: the standalone `hooks` group (yiru.yaml hook detection) migrated
  // onto `repo.hooksCheck` / `repo.setupScriptImports` — see MEMBER_ALIASES.
  ['hooks', 'repo']
])

// Fields the contract deliberately remodels rather than drops. The preload face
// passes raw ids/paths; the contract takes a single selector string ("id:…" /
// "path:…") that the runtime resolves. Flagging these would bury the real gaps.
// Why: a remodeling is only suppressed when the contract actually declares the
// mapped field, so an entry here cannot hide a contract that dropped the
// concept outright — only one that renamed it.
const KNOWN_REMODELINGS = new Map([
  ['repoId', 'repo'],
  ['repoPath', 'repo'],
  ['worktreeId', 'worktree'],
  ['worktreePath', 'worktree'],
  ['presetId', 'presetId'],
  // The `files.*` procedures address a file as (worktree selector, path
  // relative to that worktree) where the preload channel took one absolute
  // path. That is a deliberate remodeling, not a dropped field: the selector
  // rides alongside as `worktree`. Verified 2026-08-07 against
  // `contract/file-input.ts` — without these, all eight `fs` members report
  // MISSING-FIELDS and bury the genuine findings.
  ['dirPath', 'relativePath'],
  ['filePath', 'relativePath'],
  // `rootPath` is the worktree root itself, so it maps onto the selector
  // rather than onto a path inside the worktree.
  ['rootPath', 'worktree'],
  ['oldPath', 'oldRelativePath'],
  ['newPath', 'newRelativePath'],
  ['sourcePath', 'sourceRelativePath'],
  ['destinationPath', 'destinationRelativePath']
])

// Fields the preload face still declares but no handler reads. Verified
// 2026-08-07: across `src/main/filesystem/*`, `connectionId` appears only in
// argument type literals — the two places that read it
// (`fs:importExternalPaths`, `fs:resolveDroppedPathsForAgent`) do so purely to
// fail closed with "remote host is no longer supported". It is vestigial from a
// removed feature, so its absence from the contract is not a migration hazard.
// Reported in its own bucket rather than suppressed: the read sites are real,
// and a future handler could start honouring it again.
const VESTIGIAL_FIELDS = new Set(['connectionId'])

// Preload members whose contract counterpart is named differently.
const NO_ARGS = { kind: 'no-args', fields: [] }

const MEMBER_ALIASES = new Map([
  ['stats.getSummary', 'stats.summary'],
  ['sparsePresets.list', 'repo.sparsePresets'],
  ['sparsePresets.save', 'repo.saveSparsePreset'],
  ['sparsePresets.remove', 'repo.removeSparsePreset'],
  // Why: `select`/`remove` share a name across both account groups but
  // resolve to different contract members per provider — keyed by the
  // full `group.member` string so the two groups never collide.
  ['claudeAccounts.select', 'accounts.selectClaude'],
  ['claudeAccounts.remove', 'accounts.removeClaude'],
  ['codexAccounts.select', 'accounts.selectCodex'],
  ['codexAccounts.remove', 'accounts.removeCodex'],
  // Why: `host.platform` is a leaf procedure, not a subgroup, so the
  // preload group's sole `get` member needs a direct member alias rather
  // than a `platform`→`host` GROUP_ALIASES entry (which would look for a
  // nonexistent `host.get`).
  ['platform.get', 'host.platform'],
  // Why: `diagnostics.memory` returns the same RuntimeMemorySnapshot shape
  // preload's `memory.getSnapshot` does; the member name differs.
  ['memory.getSnapshot', 'diagnostics.memory'],
  // Why: the `fs` preload group was renamed to `files` in the contract, and
  // several members were renamed at the same time. Without these entries the
  // report claimed nine existing procedures needed writing, which is how `fs`
  // looked like 27 channels of outstanding work instead of a documented
  // Phase 5 local-branch holdout.
  ['fs.readFile', 'files.readPreview'],
  ['fs.writeFile', 'files.write'],
  ['fs.deletePath', 'files.delete'],
  ['fs.listFiles', 'files.listAll'],
  ['fs.watchWorktree', 'files.watch'],
  ['fs.unwatchWorktree', 'files.unwatch'],
  ['fs.readLocalLogTail', 'files.readLogTail'],
  ['fs.startLocalLogTail', 'files.watchLogTail'],
  // Why: same rename-not-missing case — preload `syncFork` is the contract's
  // `git.forkSync`; `git-client.ts` already routes registered worktrees there.
  ['git.syncFork', 'git.forkSync'],
  // Why: the `projects` preload group straddles two contract namespaces — the
  // host-setup members live under `projectHostSetup`, not `project`. A
  // GROUP_ALIASES entry alone sent them to nonexistent `project.*` paths and
  // reported five existing procedures as missing.
  ['projects.listHostSetups', 'projectHostSetup.list'],
  ['projects.createHostSetup', 'projectHostSetup.create'],
  ['projects.updateHostSetup', 'projectHostSetup.update'],
  ['projects.deleteHostSetup', 'projectHostSetup.delete'],
  ['projects.setupExistingFolder', 'projectHostSetup.setupExistingFolder'],
  ['hooks.check', 'repo.hooksCheck'],
  ['hooks.inspectSetupScriptImports', 'repo.setupScriptImports'],
  // Why: the first `openInExternalEditor` overload (a full request object)
  // carries the same path/command/connectionId fields as the contract's
  // remote-SSH editor-open procedure.
  ['shell.openInExternalEditor', 'externalEditor.openRemoteSsh']
])

function parseArgs(argv) {
  const options = { json: false, group: null }
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--json') {
      options.json = true
    } else if (argv[i] === '--group') {
      options.group = argv[i + 1] ?? null
      i += 1
    }
  }
  return options
}

// ── Preload side ────────────────────────────────────────────────────────────

function readPreloadSurface() {
  const program = ts.createProgram([API_TYPES], {
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    baseUrl: DESKTOP,
    paths: {
      '~shared/*': ['../../packages/shared/src/*'],
      '~main/*': ['src/main/*'],
      '~preload/*': ['src/preload/*']
    }
  })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(API_TYPES)
  if (!source) {
    throw new Error(`could not load ${API_TYPES}`)
  }

  let apiType = null
  ts.forEachChild(source, (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === 'PreloadApi') {
      apiType = checker.getTypeAtLocation(node.name)
    }
  })
  if (!apiType) {
    throw new Error('PreloadApi type alias not found')
  }

  const surface = new Map()
  for (const groupSymbol of checker.getPropertiesOfType(apiType)) {
    const groupName = groupSymbol.getName()
    const groupType = checker.getTypeOfSymbol(groupSymbol)
    const members = new Map()
    for (const memberSymbol of checker.getPropertiesOfType(groupType)) {
      const memberName = memberSymbol.getName()
      // Why: event subscriptions are Phase 3/appendix A territory, not invoke
      // channels — but a bare `on`-prefix test also swallowed real invoke
      // members (`starNag.onboardingCompleted`), hiding them from every count.
      // Discriminate on the return type instead: a subscription hands back an
      // unsubscribe function, an invoke member returns a Promise.
      if (memberName.startsWith('on') && !returnsPromise(checker, memberSymbol)) {
        continue
      }
      const fields = firstParameterFields(checker, checker.getTypeOfSymbol(memberSymbol))
      if (fields) {
        members.set(memberName, fields)
      }
    }
    if (members.size > 0) {
      surface.set(groupName, members)
    }
  }
  return surface
}

function returnsPromise(checker, memberSymbol) {
  const [signature] = checker.getTypeOfSymbol(memberSymbol).getCallSignatures()
  if (!signature) {
    return false
  }
  return checker.typeToString(signature.getReturnType()).startsWith('Promise<')
}

function firstParameterFields(checker, memberType) {
  const [signature] = checker.getSignaturesOfType(memberType, ts.SignatureKind.Call)
  if (!signature) {
    return null
  }
  const [firstParam] = signature.getParameters()
  if (!firstParam) {
    return NO_ARGS
  }
  const paramType = nonNullable(checker, checker.getTypeOfSymbol(firstParam))
  // Why: a primitive parameter still answers getPropertiesOfType with its
  // prototype methods (charAt, slice, …). Only object-ish params are worth
  // diffing field-wise; everything else is reported as positional.
  if (!isDiffableObjectType(paramType)) {
    return { kind: 'positional', fields: [] }
  }
  const props = checker.getPropertiesOfType(paramType).map((prop) => prop.getName())
  return props.length > 0
    ? { kind: 'object', fields: props.sort() }
    : { kind: 'positional', fields: [] }
}

function isDiffableObjectType(type) {
  const primitive =
    ts.TypeFlags.StringLike |
    ts.TypeFlags.NumberLike |
    ts.TypeFlags.BooleanLike |
    ts.TypeFlags.BigIntLike |
    ts.TypeFlags.ESSymbolLike |
    ts.TypeFlags.Void |
    ts.TypeFlags.Undefined |
    ts.TypeFlags.Null
  if (type.getFlags() & primitive) {
    return false
  }
  if (type.isUnion()) {
    return type.types.every((candidate) => isDiffableObjectType(candidate))
  }
  return true
}

function nonNullable(checker, type) {
  return type.isUnion()
    ? checker.getUnionType(
        type.types.filter((candidate) => {
          const flags = candidate.getFlags()
          return !(flags & ts.TypeFlags.Undefined) && !(flags & ts.TypeFlags.Null)
        })
      )
    : type
}

// ── Contract side ───────────────────────────────────────────────────────────

function readContractSurface() {
  // Why: resolved through the desktop workspace, not this script's directory —
  // `scripts/` is outside any package that depends on runtime-protocol.
  const contractModule = require('@yiru/runtime-protocol/contract')
  const paths = new Map()
  walkContract(contractModule.runtimeContract, [], paths)
  return paths
}

function walkContract(node, path, out) {
  if (!node || typeof node !== 'object') {
    return
  }
  const meta = node['~orpc']
  // Why: any node carrying `~orpc` is a leaf procedure — the same duck-type the
  // router-completeness walk uses. Gating registration on `inputSchema` made
  // every procedure declaring no `.input()` invisible, so the report listed it
  // as "no contract procedure" even though it existed (e.g. `project.list`,
  // `folderWorkspace.list`). That inflated the outstanding-work count the
  // Phase 4/5 acceptance audit was built on.
  if (meta) {
    out.set(path.join('.'), 'inputSchema' in meta ? zodInputFields(meta.inputSchema) : NO_ARGS)
    return
  }
  for (const [key, value] of Object.entries(node)) {
    walkContract(value, [...path, key], out)
  }
}

// Unwraps the wrappers the contract actually uses (`.default()`, `.optional()`)
// down to the ZodObject whose `shape` names the accepted fields.
function zodInputFields(schema) {
  let current = schema
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (current.shape && typeof current.shape === 'object') {
      return { kind: 'object', fields: Object.keys(current.shape).sort() }
    }
    const inner = current._def?.innerType ?? current.def?.innerType
    if (!inner) {
      break
    }
    current = inner
  }
  return { kind: 'opaque', fields: [] }
}

// ── Comparison ──────────────────────────────────────────────────────────────

function contractPathFor(group, member) {
  const aliased = MEMBER_ALIASES.get(`${group}.${member}`)
  if (aliased) {
    return aliased
  }
  return `${GROUP_ALIASES.get(group) ?? group}.${member}`
}

function compare(preload, contract, groupFilter) {
  const rows = []
  for (const [group, members] of preload) {
    if (groupFilter && group !== groupFilter) {
      continue
    }
    for (const [member, preloadInput] of members) {
      const path = contractPathFor(group, member)
      const contractInput = contract.get(path)
      if (!contractInput) {
        rows.push({ group, member, path, status: 'no-contract-procedure' })
        continue
      }
      if (preloadInput.kind !== 'object' || contractInput.kind !== 'object') {
        rows.push({
          group,
          member,
          path,
          status: 'not-comparable',
          detail: `preload=${preloadInput.kind} contract=${contractInput.kind}`
        })
        continue
      }
      const contractFields = new Set(contractInput.fields)
      const absent = preloadInput.fields.filter((field) => {
        if (contractFields.has(field)) {
          return false
        }
        const remodeled = KNOWN_REMODELINGS.get(field)
        return !(remodeled && contractFields.has(remodeled))
      })
      const missing = absent.filter((field) => !VESTIGIAL_FIELDS.has(field))
      const vestigial = absent.filter((field) => VESTIGIAL_FIELDS.has(field))
      rows.push({
        group,
        member,
        path,
        status: missing.length > 0 ? 'MISSING-FIELDS' : vestigial.length > 0 ? 'vestigial' : 'ok',
        missing,
        vestigial,
        preloadFields: preloadInput.fields,
        contractFields: contractInput.fields
      })
    }
  }
  return rows
}

function report(rows) {
  const missing = rows.filter((row) => row.status === 'MISSING-FIELDS')
  const noProcedure = rows.filter((row) => row.status === 'no-contract-procedure')
  const notComparable = rows.filter((row) => row.status === 'not-comparable')
  const ok = rows.filter((row) => row.status === 'ok')
  const vestigial = rows.filter((row) => row.status === 'vestigial')

  if (missing.length > 0) {
    console.log(`\n## Contract narrower than preload (${missing.length}) — migrate with care\n`)
    for (const row of missing) {
      console.log(`  ${row.group}.${row.member}  →  ${row.path}`)
      console.log(`     preload-only fields: ${row.missing.join(', ')}`)
    }
  }
  if (noProcedure.length > 0) {
    console.log(`\n## No contract procedure (${noProcedure.length}) — needs one written\n`)
    const byGroup = new Map()
    for (const row of noProcedure) {
      byGroup.set(row.group, [...(byGroup.get(row.group) ?? []), row.member])
    }
    for (const [group, members] of [...byGroup].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${group} (${members.length}): ${members.join(', ')}`)
    }
  }
  if (notComparable.length > 0) {
    console.log(`\n## Not field-comparable (${notComparable.length}) — read these by hand\n`)
    for (const row of notComparable) {
      console.log(`  ${row.group}.${row.member} → ${row.path}  [${row.detail}]`)
    }
  }
  if (vestigial.length > 0) {
    console.log(
      `\n## Only vestigial fields absent (${vestigial.length}) — safe to migrate\n` +
        `  ${vestigial.map((row) => `${row.group}.${row.member}`).join(', ')}\n`
    )
  }
  console.log(
    `\n## Summary\n  ok=${ok.length}  missing-fields=${missing.length}` +
      `  vestigial-only=${vestigial.length}  no-procedure=${noProcedure.length}` +
      `  not-comparable=${notComparable.length}\n`
  )
  return missing.length
}

const options = parseArgs(process.argv)
const preload = readPreloadSurface()
const contract = readContractSurface()
const rows = compare(preload, contract, options.group)
if (options.json) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  report(rows)
}
