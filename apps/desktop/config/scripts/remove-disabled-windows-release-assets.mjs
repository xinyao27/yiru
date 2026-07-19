#!/usr/bin/env node

import { pathToFileURL } from 'node:url'

import { deleteWindowsReleaseAssetsForTag } from './publish-complete-draft-releases.mjs'

async function main() {
  const tag = process.argv[2]
  if (!tag) {
    throw new Error('Usage: node config/scripts/remove-disabled-windows-release-assets.mjs <tag>')
  }
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GH_TOKEN or GITHUB_TOKEN must be set')
  }
  const repo = process.env.GITHUB_REPOSITORY || 'xinyao27/yiru'
  const deleted = await deleteWindowsReleaseAssetsForTag({ repo, tag, token })
  console.log(
    deleted.length > 0
      ? `Removed disabled Windows release assets: ${deleted.join(', ')}`
      : `No disabled Windows release assets found for ${repo}@${tag}`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
