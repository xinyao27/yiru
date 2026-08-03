// Why: the RPC surface is the security boundary. Every method declares an
// `access` requirement, and this inventory makes a change to any method's
// authority show up as a reviewable diff instead of one line buried in a PR.
// Run with --write to regenerate, --check to fail CI when stale or incomplete.
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const METHODS_DIR = 'src/main/runtime/rpc/methods'
const INVENTORY_PATH = 'src/main/runtime/rpc/access-inventory.generated.json'
const DEFINE_PATTERN = /\bdefine(Streaming)?Method\s*\(/g

/**
 * Replace string and comment contents with spaces, preserving every offset.
 * Brace matching then cannot be fooled by a `{` inside a template literal or
 * a `//` inside a regex-looking string.
 */
function maskLiterals(source) {
  const out = source.split('')
  let index = 0
  const length = source.length
  while (index < length) {
    const char = source[index]
    const next = source[index + 1]
    if (char === '/' && next === '/') {
      while (index < length && source[index] !== '\n') {
        out[index] = ' '
        index += 1
      }
      continue
    }
    if (char === '/' && next === '*') {
      out[index] = ' '
      out[index + 1] = ' '
      index += 2
      while (index < length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index] !== '\n') {
          out[index] = ' '
        }
        index += 1
      }
      out[index] = ' '
      out[index + 1] = ' '
      index += 2
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      const quote = char
      index += 1
      while (index < length) {
        if (source[index] === '\\') {
          out[index] = ' '
          out[index + 1] = ' '
          index += 2
          continue
        }
        if (source[index] === quote) {
          break
        }
        if (source[index] !== '\n') {
          out[index] = ' '
        }
        index += 1
      }
      index += 1
      continue
    }
    index += 1
  }
  return out.join('')
}

function findMatchingParen(masked, openIndex) {
  let depth = 0
  for (let index = openIndex; index < masked.length; index += 1) {
    const char = masked[index]
    if (char === '(') {
      depth += 1
    } else if (char === ')') {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }
  return -1
}

/** Offsets of the top-level keys of the first object literal inside the call. */
function topLevelKeyOffsets(masked, callStart, callEnd) {
  const objectStart = masked.indexOf('{', callStart)
  if (objectStart === -1 || objectStart > callEnd) {
    return []
  }
  const offsets = []
  let depth = 0
  let atKeyPosition = false
  for (let index = objectStart; index <= callEnd; index += 1) {
    const char = masked[index]
    if (char === '{' || char === '[' || char === '(') {
      depth += 1
      atKeyPosition = depth === 1
      continue
    }
    if (char === '}' || char === ']' || char === ')') {
      depth -= 1
      if (depth === 0) {
        break
      }
      continue
    }
    if (depth === 1 && char === ',') {
      atKeyPosition = true
      continue
    }
    if (depth === 1 && atKeyPosition && /[A-Za-z_$]/.test(char)) {
      offsets.push(index)
      atKeyPosition = false
    }
  }
  return offsets
}

function readKeyAt(source, offset) {
  const match = /^([A-Za-z_$][\w$]*)\s*:/.exec(source.slice(offset, offset + 64))
  return match ? match[1] : null
}

function readIdentity(source, offset, key) {
  const tail = source.slice(offset, offset + 512)
  if (key === 'name') {
    const match = /^name\s*:\s*'([^']+)'/.exec(tail)
    return match ? match[1] : null
  }
  const match = /^contract\s*:\s*([A-Za-z_$][\w$]*)/.exec(tail)
  return match ? `<contract:${match[1]}>` : null
}

function readAccess(source, offset) {
  const tail = source.slice(offset, offset + 512)
  // Why: `principals` is an optional narrowing, so the literal may carry more
  // keys after `tier` — match up to the delimiter rather than a closing brace.
  const match = /^access\s*:\s*\{\s*scope\s*:\s*'([^']+)'\s*,\s*tier\s*:\s*'([^']+)'\s*[,}]/.exec(
    tail
  )
  if (!match) {
    return null
  }
  const principals = /principals\s*:\s*\[([^\]]*)\]/.exec(tail)
  const parsed = principals
    ? principals[1]
        .split(',')
        .map((entry) => entry.trim().replace(/^'|'$/g, ''))
        .filter(Boolean)
    : null
  return {
    scope: match[1],
    tier: match[2],
    ...(parsed && parsed.length > 0 ? { principals: parsed } : {})
  }
}

async function collectMethodFiles(root) {
  const files = []
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.name.endsWith('.ts')) {
        files.push(full)
      }
    }
  }
  await walk(root)
  return files.sort()
}

async function buildInventory(cwd) {
  const files = await collectMethodFiles(path.join(cwd, METHODS_DIR))
  const entries = []
  const missing = []
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8')
    const masked = maskLiterals(source)
    const relative = path.relative(cwd, file).split(path.sep).join('/')
    DEFINE_PATTERN.lastIndex = 0
    let match
    while ((match = DEFINE_PATTERN.exec(masked)) !== null) {
      const openParen = masked.indexOf('(', match.index)
      const closeParen = findMatchingParen(masked, openParen)
      if (closeParen === -1) {
        continue
      }
      let identity = null
      let access = null
      for (const offset of topLevelKeyOffsets(masked, openParen, closeParen)) {
        const key = readKeyAt(source, offset)
        if (key === 'name' || key === 'contract') {
          identity = identity ?? readIdentity(source, offset, key)
        } else if (key === 'access') {
          access = readAccess(source, offset)
        }
      }
      const line = source.slice(0, match.index).split('\n').length
      const label = identity ?? `<unnamed@${relative}:${line}>`
      if (!access) {
        missing.push(`${relative}:${line} ${label}`)
        continue
      }
      entries.push({ method: label, file: relative, ...access })
    }
  }
  entries.sort((a, b) => a.method.localeCompare(b.method) || a.file.localeCompare(b.file))
  return { entries, missing }
}

function isSameInventory(existing, serialized) {
  if (existing === null) {
    return false
  }
  try {
    return JSON.stringify(JSON.parse(existing)) === JSON.stringify(JSON.parse(serialized))
  } catch {
    return false
  }
}

async function main() {
  const cwd = process.cwd()
  const write = process.argv.includes('--write')
  const { entries, missing } = await buildInventory(cwd)

  if (missing.length > 0) {
    console.error(`Missing \`access\` on ${missing.length} RPC method(s):`)
    for (const item of missing) {
      console.error(`  ${item}`)
    }
    console.error('\nEvery defineMethod/defineStreamingMethod must declare access.')
    console.error('See docs/coworking-unified-remote-access.md §4 for the rubric.')
    process.exitCode = 1
    return
  }

  const serialized = `${JSON.stringify({ methodCount: entries.length, methods: entries }, null, 2)}\n`
  const target = path.join(cwd, INVENTORY_PATH)

  if (write) {
    await fs.writeFile(target, serialized)
    console.log(`Wrote ${entries.length} methods to ${INVENTORY_PATH}`)
    return
  }

  const existing = await fs.readFile(target, 'utf8').catch(() => null)
  // Why: compare parsed content, not bytes. `vp fmt` reformats JSON in the tree,
  // so a byte comparison would report a stale inventory on every run after a
  // format pass even though nothing about the authority declarations changed.
  if (!isSameInventory(existing, serialized)) {
    console.error(`${INVENTORY_PATH} is stale.`)
    console.error('Run: vp run generate:rpc-access-inventory -- --write')
    process.exitCode = 1
    return
  }
  console.log(`RPC access inventory current: ${entries.length} methods.`)
}

await main()
