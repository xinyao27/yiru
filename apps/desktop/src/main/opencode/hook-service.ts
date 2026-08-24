import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

import { mirrorEntry, safeRemoveTree } from '../pty/overlay-mirror'
import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { getOpenCodePluginSource } from './hook-plugin-source'

export { getOpenCodeFamilyPluginSource, getOpenCodePluginSource } from './hook-plugin-source'

const YIRU_OPENCODE_PLUGIN_FILE = 'yiru-opencode-status.js'
const OPENCODE_LEGACY_HOOKS_DIR = 'opencode-hooks'
const OPENCODE_OVERLAY_DIR = 'opencode-config-overlays'
const OPENCODE_SHARED_CONFIG_DIR = 'shared'
const OPENCODE_OVERLAY_MANIFEST_FILE = '.yiru-opencode-overlay-manifest.json'

type OpenCodeOverlayManifest = {
  topLevelEntries: string[]
  pluginEntries: string[]
}

function isUsableId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 1024
}

function toSafeDirName(id: string): string {
  // Why: a hash accepts daemon-shaped IDs containing paths without allowing
  // those paths to influence the overlay directory hierarchy.
  return createHash('sha256').update(id).digest('hex').slice(0, 32)
}

export class OpenCodeHookService {
  clearPty(_ptyId: string): void {
    // Why: current config dirs are app/source-scoped, not PTY-scoped. OpenCode
    // may hold thousands of runtime files here, so synchronous teardown would
    // freeze Electron's main process on Windows.
  }

  buildPtyEnv(ptyId: string, existingConfigDir?: string | undefined): Record<string, string> {
    if (!isUsableId(ptyId)) {
      return existingConfigDir ? { OPENCODE_CONFIG_DIR: existingConfigDir } : {}
    }
    if (!existingConfigDir) {
      const configDir = this.writeSharedPluginConfig()
      return configDir ? { OPENCODE_CONFIG_DIR: configDir } : {}
    }
    // Why: never materialize a typoed user path and silently replace their
    // configuration with a Yiru-owned directory.
    if (!existsSync(existingConfigDir)) {
      return { OPENCODE_CONFIG_DIR: existingConfigDir }
    }
    const overlayDir = this.getSourceOverlayDir(existingConfigDir)
    try {
      mkdirSync(overlayDir, { recursive: true })
      this.mirrorUserConfig(existingConfigDir, overlayDir)
      this.writePluginIntoOverlay(overlayDir)
    } catch {
      // Why: plugin installation is best-effort; user config always wins when
      // symlinks or userData writes are unavailable.
      return { OPENCODE_CONFIG_DIR: existingConfigDir }
    }
    return { OPENCODE_CONFIG_DIR: overlayDir }
  }

  private getOverlayRoot(): string {
    return join(getRuntimeHostPathsProvider().userDataPath(), OPENCODE_OVERLAY_DIR)
  }

  private getSourceOverlayDir(sourceConfigDir: string): string {
    return join(this.getOverlayRoot(), toSafeDirName(`source:${sourceConfigDir}`))
  }

  private getSharedConfigDir(): string {
    return join(
      getRuntimeHostPathsProvider().userDataPath(),
      OPENCODE_LEGACY_HOOKS_DIR,
      OPENCODE_SHARED_CONFIG_DIR
    )
  }

  private readOverlayManifest(overlayDir: string): OpenCodeOverlayManifest {
    try {
      const parsed = JSON.parse(
        readFileSync(join(overlayDir, OPENCODE_OVERLAY_MANIFEST_FILE), 'utf8')
      ) as Partial<OpenCodeOverlayManifest>
      return {
        topLevelEntries: Array.isArray(parsed.topLevelEntries) ? parsed.topLevelEntries : [],
        pluginEntries: Array.isArray(parsed.pluginEntries) ? parsed.pluginEntries : []
      }
    } catch {
      return { topLevelEntries: [], pluginEntries: [] }
    }
  }

  private writeOverlayManifest(overlayDir: string, manifest: OpenCodeOverlayManifest): void {
    writeFileSync(
      join(overlayDir, OPENCODE_OVERLAY_MANIFEST_FILE),
      `${JSON.stringify(manifest, null, 2)}\n`
    )
  }

  private clearManifestEntries(overlayDir: string, manifest: OpenCodeOverlayManifest): void {
    for (const entryName of manifest.topLevelEntries) {
      safeRemoveTree(join(overlayDir, entryName))
    }
    const overlayPluginsDir = join(overlayDir, 'plugins')
    for (const entryName of manifest.pluginEntries) {
      if (entryName !== YIRU_OPENCODE_PLUGIN_FILE) {
        safeRemoveTree(join(overlayPluginsDir, entryName))
      }
    }
  }

  private mirrorUserConfig(sourceDir: string, overlayDir: string): void {
    const previousManifest = this.readOverlayManifest(overlayDir)
    // Why: persistent source overlays may contain OpenCode-owned node_modules;
    // remove only paths recorded as Yiru mirrors.
    this.clearManifestEntries(overlayDir, previousManifest)
    const nextManifest: OpenCodeOverlayManifest = { topLevelEntries: [], pluginEntries: [] }

    for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
      const sourcePath = join(sourceDir, entry.name)
      if (entry.name === 'plugins') {
        const isSymlink = entry.isSymbolicLink()
        let isLinkPointingToDir = false
        if (isSymlink) {
          try {
            isLinkPointingToDir = statSync(sourcePath).isDirectory()
          } catch {
            // Why: a broken or unreadable link must be mirrored as a link,
            // rather than treated as a writable plugins directory.
            isLinkPointingToDir = false
          }
        }
        if ((!isSymlink && entry.isDirectory()) || isLinkPointingToDir) {
          const resolvedSource = isLinkPointingToDir ? realpathSync(sourcePath) : sourcePath
          const overlayPluginsDir = join(overlayDir, 'plugins')
          mkdirSync(overlayPluginsDir, { recursive: true })
          for (const pluginEntry of readdirSync(resolvedSource, { withFileTypes: true })) {
            // Why: shadow Yiru's filename without ever linking through to and
            // overwriting a same-named user plugin.
            if (pluginEntry.name === YIRU_OPENCODE_PLUGIN_FILE) {
              continue
            }
            mirrorEntry(
              join(resolvedSource, pluginEntry.name),
              join(overlayPluginsDir, pluginEntry.name)
            )
            nextManifest.pluginEntries.push(pluginEntry.name)
          }
          continue
        }
      }
      mirrorEntry(sourcePath, join(overlayDir, entry.name))
      nextManifest.topLevelEntries.push(entry.name)
    }
    this.writeOverlayManifest(overlayDir, nextManifest)
  }

  private writePluginIntoOverlay(overlayDir: string): void {
    const pluginsDir = join(overlayDir, 'plugins')
    mkdirSync(pluginsDir, { recursive: true })
    const pluginPath = join(pluginsDir, YIRU_OPENCODE_PLUGIN_FILE)
    try {
      // Why: writeFileSync follows symlinks; unlink first so a stale mirror
      // cannot overwrite the user's same-named source plugin.
      unlinkSync(pluginPath)
    } catch {
      // A fresh overlay has no plugin yet; write failures surface below.
    }
    writeFileSync(pluginPath, getOpenCodePluginSource())
  }

  private writeSharedPluginConfig(): string | null {
    const configDir = this.getSharedConfigDir()
    const pluginsDir = join(configDir, 'plugins')
    try {
      mkdirSync(pluginsDir, { recursive: true })
      writeFileSync(join(pluginsDir, YIRU_OPENCODE_PLUGIN_FILE), getOpenCodePluginSource())
    } catch {
      // Why: status integration is non-critical; a locked userData directory
      // must not prevent the PTY from starting.
      return null
    }
    return configDir
  }
}

export const openCodeHookService = new OpenCodeHookService()
