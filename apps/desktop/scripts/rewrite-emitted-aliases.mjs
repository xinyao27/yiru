#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

/**
 * Turns alias specifiers in the compiled CLI output back into relative requires.
 *
 * Why: `build:cli` is a plain `tsc` emit with no bundler, and tsc writes module
 * specifiers verbatim — it never applies `paths`. Without this pass the packaged
 * CLI would `require("~shared/…")` and die at startup. The bundled targets
 * (main, preload, renderer, relay) resolve aliases at build time and never reach
 * this script.
 */

const APP_ROOT = path.resolve(import.meta.dirname, '..')
const OUT_ROOT = path.join(APP_ROOT, 'out')

// Must mirror the `paths` in config/tsconfig.cli.json.
const ALIAS_ROOTS = {
  '~shared': path.join(OUT_ROOT, 'shared'),
  '~main': path.join(OUT_ROOT, 'main')
}

const SPECIFIER = /(\brequire\(\s*|\bfrom\s*|\bimport\(\s*)(['"])(~[^'"]+)\2/g

function listJavaScriptFiles(directory) {
  const found = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      found.push(...listJavaScriptFiles(absolute))
    } else if (entry.isFile() && absolute.endsWith('.js')) {
      found.push(absolute)
    }
  }
  return found
}

function relativeSpecifier(fromFile, targetAbsolute) {
  const relative = path.relative(path.dirname(fromFile), targetAbsolute)
  const posix = relative.split(path.sep).join('/')
  return posix.startsWith('.') ? posix : `./${posix}`
}

function rewriteFile(file) {
  const source = fs.readFileSync(file, 'utf8')
  let rewrites = 0
  const updated = source.replace(SPECIFIER, (match, prefix, quote, specifier) => {
    const separator = specifier.indexOf('/')
    const alias = separator === -1 ? specifier : specifier.slice(0, separator)
    const root = ALIAS_ROOTS[alias]
    if (!root) {
      return match
    }
    const target = path.join(root, specifier.slice(separator + 1))
    rewrites += 1
    return `${prefix}${quote}${relativeSpecifier(file, target)}${quote}`
  })
  if (rewrites > 0) {
    fs.writeFileSync(file, updated, 'utf8')
  }
  return rewrites
}

function main() {
  if (!fs.existsSync(OUT_ROOT)) {
    throw new Error(`Compiled output is missing: ${path.relative(APP_ROOT, OUT_ROOT)}`)
  }
  const files = listJavaScriptFiles(OUT_ROOT)
  let rewrites = 0
  for (const file of files) {
    rewrites += rewriteFile(file)
  }

  // Why: a new alias that this script does not know about would otherwise ship a
  // specifier Node cannot resolve, and only crash once a user runs that command.
  const survivors = []
  for (const file of files) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      survivors.push(`${path.relative(APP_ROOT, file)}: ${match[3]}`)
    }
  }
  if (survivors.length > 0) {
    throw new Error(
      `Compiled output still contains unresolved alias specifiers:\n${survivors
        .slice(0, 20)
        .join('\n')}\nAdd the alias to ALIAS_ROOTS in scripts/rewrite-emitted-aliases.mjs.`
    )
  }
  console.log(`[cli-aliases] rewrote ${rewrites} alias specifier(s) across ${files.length} file(s)`)
}

main()
